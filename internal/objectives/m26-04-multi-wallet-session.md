# 마일스톤 m26-04: 멀티 지갑 세션 + 에이전트 자기 발견

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

하나의 세션 토큰으로 여러 지갑에 접근할 수 있는 **API 키 모델** 세션 구조를 제공하여, AI 에이전트가 토큰 하나로 멀티체인 지갑 포트폴리오를 관리하고 **마스터 패스워드 없이** 자기 상황을 파악(자기 발견)할 수 있는 상태.

---

## 배경

### 현재 세션 모델의 한계

현재 세션은 1:1 관계(세션 → 지갑)로 설계되어 있다:

```
sessions 테이블
  id: PRIMARY KEY
  wallet_id: NOT NULL FK → wallets(id)   ← 단일 지갑 고정
  token_hash: 토큰 해시
```

멀티체인 에이전트(Solana + Ethereum + Base)를 운영하려면 **지갑 수만큼 세션 토큰을 관리**해야 한다:

```
현재: 세션 A(SOL 지갑) + 세션 B(ETH 지갑) + 세션 C(Base 지갑) = 토큰 3개
목표: 세션 X(SOL + ETH + Base) = 토큰 1개
```

### 마스터 패스워드 의존 문제

에이전트가 기본 세팅을 자동화하려면 마스터 패스워드가 필요한데, 마스터 패스워드를 알면 세션 보안이 무의미해지는 모순이 발생한다. 세션 토큰만으로 자기 발견(접근 가능한 지갑, 정책, API 사용법)이 가능하면 마스터 패스워드를 에이전트에 전달할 필요가 없다.

| 시나리오 | 마스터 PW 필요 | 세션 보안 유효 |
|---------|--------------|--------------|
| 사람이 세팅 → 세션 토큰만 전달 | 아니오 | **유효** |
| 에이전트가 전부 자동화 (현재) | 예 | 무의미 |
| 사람이 세팅 → 에이전트 자기 발견 (목표) | **아니오** | **유효** |

### 목표 UX

```
관리자(사람):
  1. waiaas init → waiaas quickset
  2. 멀티 지갑 세션 생성 (SOL + ETH + Base 지갑 연결)
  3. 세션 토큰 1개를 에이전트에 전달

에이전트(AI):
  1. GET /v1/connect-info (sessionAuth)
     → 접근 가능한 지갑 목록, 네트워크, 정책, API 사용법 자동 파악
  2. 바로 운영 시작 — 스킬 파일, MCP 설정 불필요
```

---

## 구현 대상

### 1. 세션 모델 변경 (1:1 → 1:N)

#### DB 스키마

현재 `sessions.wallet_id` (단일 FK)를 **junction 테이블**로 분리:

```sql
-- 신규 테이블
CREATE TABLE session_wallets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id  TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
);
CREATE INDEX idx_session_wallets_session ON session_wallets(session_id);
CREATE INDEX idx_session_wallets_wallet ON session_wallets(wallet_id);
```

**is_default 불변량**: 세션당 `is_default = 1`인 행이 정확히 1개여야 한다. SQLite CHECK 제약으로는 크로스-행 불변량을 표현할 수 없으므로, **애플리케이션 레벨**에서 다음을 보장한다:
- 세션 생성 시: `defaultWalletId`(또는 첫 번째 지갑)에 `is_default = 1` 설정
- 기본 지갑 변경 시: 트랜잭션 내에서 기존 default 해제 → 새 default 설정
- 기본 지갑 제거 시: 에러 반환 (먼저 기본 지갑을 변경해야 함)

**지갑 삭제 cascade 방어**: `session_wallets`에 `ON DELETE CASCADE`가 설정되어 있으므로, wallets 테이블에서 지갑 삭제 시 해당 junction 행이 자동 삭제된다. 기본 지갑이 삭제되면 is_default 불변량이 파손될 수 있다. **방어 로직**: 지갑 삭제(TERMINATE) API 핸들러에서 삭제 전 `session_wallets`를 조회하여, 해당 지갑이 어떤 세션의 is_default인 경우 (1) 다른 지갑이 있으면 자동으로 다음 지갑을 default로 승격, (2) 마지막 지갑이면 세션을 자동 revoke한다.

`sessions.wallet_id` 컬럼은 **마이그레이션 과정에서 제거**:
1. `session_wallets` 테이블 생성
2. 기존 `sessions.wallet_id` 데이터를 `session_wallets`에 이관 (`is_default = 1`)
3. `sessions.wallet_id` 컬럼 삭제

> **SQLite 호환성**: `ALTER TABLE DROP COLUMN`은 SQLite 3.35.0+ 필요. better-sqlite3가 번들하는 SQLite 버전을 확인하고, 미지원 시 테이블 재생성(CREATE new → INSERT → DROP old → RENAME) 전략을 사용한다.

**Drizzle 스키마 동기화 전략**: 마이그레이션 적용 후 `schema.ts`의 `sessions` 테이블에서 `walletId` 컬럼을 **즉시 제거**하고 `session_wallets` 테이블 정의를 추가한다. `getCreateTableStatements()`의 sessions DDL에서도 `wallet_id` 컬럼을 제거하고 `session_wallets` CREATE 문을 추가한다. `LATEST_SCHEMA_VERSION`을 19로 올린다.

#### JWT 변경

| 항목 | Before | After |
|------|--------|-------|
| `wlt` 클레임 | 단일 walletId | **기본 walletId** (하위 호환) |
| 지갑 목록 | JWT에 없음 | **DB 조회** (session_wallets) |

> JWT에 지갑 배열을 넣지 않는 이유: 지갑 추가/제거 시 토큰 재발급이 필요해짐. DB 기반이면 동적 변경 가능.

#### Session Auth 미들웨어 변경

`session-auth.ts`에서 `c.set('sessionId', payload.sub)`는 이미 존재한다. 변경점은 **`walletId` → `defaultWalletId`** 치환뿐이다:

```typescript
// Before (session-auth.ts:66-67)
c.set('sessionId', payload.sub);
c.set('walletId', payload.wlt);  // JWT에서 단일 지갑

// After
c.set('sessionId', payload.sub);                 // 기존 유지
c.set('defaultWalletId', payload.wlt);            // walletId → defaultWalletId 변경
// walletId는 요청 파라미터 또는 기본 지갑에서 resolveWalletId()로 결정
```

#### Owner Auth 미들웨어 변경

`owner-auth.ts:71`에서 `c.get('walletId')` → `c.get('defaultWalletId')`로 변경. 세션 토큰 기반 Owner 인증 시 기본 지갑을 사용하되, 명시적 `walletId` 파라미터가 있으면 이를 우선한다.

### 2. API 변경

#### 지갑 지정 방식

`/v1/wallet/*` 엔드포인트에 **선택적 walletId 쿼리 파라미터** 추가:

```
GET /v1/wallet/balance                    → 기본 지갑 잔액
GET /v1/wallet/balance?walletId={id}      → 특정 지갑 잔액

POST /v1/transactions/send                → 기본 지갑으로 전송
POST /v1/transactions/send { walletId }   → 특정 지갑으로 전송
```

**하위 호환**: `walletId` 미지정 시 기본 지갑(`is_default = 1`) 사용. 지갑 1개짜리 세션은 기존과 동일하게 동작.

#### 지갑 접근 검증

세션에 연결되지 않은 지갑 요청 시 에러:

```typescript
// 헬퍼 함수 (라우트 핸들러에서 호출)
function resolveWalletId(c: Context, bodyWalletId?: string): string {
  // 우선순위: (1) body walletId → (2) query walletId → (3) 기본 지갑
  // POST 요청은 body에서, GET 요청은 query에서 walletId를 지정한다.
  const requested = bodyWalletId ?? c.req.query('walletId');
  const walletId = requested ?? c.get('defaultWalletId');

  // session_wallets 테이블에서 접근 권한 확인
  const allowed = db.select().from(sessionWallets)
    .where(and(
      eq(sessionWallets.sessionId, c.get('sessionId')),
      eq(sessionWallets.walletId, walletId),
    )).get();

  if (!allowed) throw new WAIaaSError('WALLET_ACCESS_DENIED');
  return walletId;
}
```

> **walletId 파라미터 규칙**: POST/PUT 요청은 **body의 `walletId` 필드**만 사용하고 쿼리 파라미터를 허용하지 않는다. GET/DELETE 요청은 **쿼리 파라미터 `?walletId=`**만 사용한다. 두 곳에 동시 지정하는 상황은 발생하지 않는다.

#### 세션 생성 API 변경

```typescript
// Before
POST /v1/sessions { walletId: "wallet-1" }

// After
POST /v1/sessions { walletIds: ["wallet-1", "wallet-2", "wallet-3"], defaultWalletId?: "wallet-1" }

// 하위 호환: walletId 단수도 허용
POST /v1/sessions { walletId: "wallet-1" }  → walletIds: ["wallet-1"]
```

#### 세션에 지갑 동적 추가/제거

```
POST   /v1/sessions/:id/wallets                { walletId }           → 지갑 추가 (masterAuth)
DELETE /v1/sessions/:id/wallets/:walletId                              → 지갑 제거 (masterAuth)
PATCH  /v1/sessions/:id/wallets/:walletId/default                      → 기본 지갑 변경 (masterAuth)
GET    /v1/sessions/:id/wallets                                        → 연결된 지갑 목록 (masterAuth)
```

**엣지 케이스 처리:**

| 상황 | 동작 |
|------|------|
| 존재하지 않는 walletId로 추가 | 404 `WALLET_NOT_FOUND` |
| 이미 연결된 walletId 추가 | 409 `WALLET_ALREADY_LINKED` |
| 기본 지갑 제거 시도 | 400 `CANNOT_REMOVE_DEFAULT_WALLET` (먼저 PATCH로 기본 지갑 변경 필요) |
| 마지막 지갑 제거 시도 | 400 `SESSION_REQUIRES_WALLET` (최소 1개 지갑 필요) |

#### 세션 갱신 (renewal) 변경

현재 `PUT /sessions/:id/renew` 핸들러가 `session.walletId`로 새 JWT의 `wlt` 클레임을 생성한다. `wallet_id` 컬럼 제거 후에는 `session_wallets` 테이블에서 `is_default = 1`인 지갑 ID를 조회하여 JWT `wlt` 클레임에 설정한다.

```typescript
// Before (sessions.ts:200)
const jwtPayload: JwtPayload = { sub: sessionId, wlt: session.walletId, ... };

// After
const defaultWallet = db.select().from(sessionWallets)
  .where(and(eq(sessionWallets.sessionId, session.id), eq(sessionWallets.isDefault, 1)))
  .get();
const jwtPayload: JwtPayload = { sub: sessionId, wlt: defaultWallet!.walletId, ... };
```

#### 세션 목록 API 응답 변경

`GET /sessions` 응답에서 `walletId: string` → `wallets: Array<{ id, name, isDefault }>` 배열로 변경. 하위 호환을 위해 `walletId`(기본 지갑)와 `walletName`(기본 지갑 이름) 필드도 유지한다.

```typescript
// 응답 예시
{
  "id": "sess_abc",
  "walletId": "wallet-1",       // 하위 호환: 기본 지갑
  "walletName": "Solana Main",  // 하위 호환: 기본 지갑 이름
  "wallets": [                  // 신규: 연결된 전체 지갑 목록
    { "id": "wallet-1", "name": "Solana Main", "isDefault": true },
    { "id": "wallet-2", "name": "Ethereum", "isDefault": false }
  ],
  "status": "ACTIVE",
  ...
}
```

#### max_sessions_per_wallet 의미 변경

현재 `sessions.wallet_id`로 지갑당 활성 세션 수를 체크한다(`sessions.ts:170-180`). `wallet_id` 컬럼 제거 후에는 `session_wallets` 조인으로 변경한다. 의미: **해당 지갑이 포함된 활성 세션 수**를 카운트한다. 멀티 지갑 세션 생성 시 `walletIds` 배열의 **각 지갑마다** 활성 세션 수를 체크하여 어느 하나라도 한도를 초과하면 `SESSION_LIMIT_EXCEEDED`를 반환한다.

#### 세션 constraints와 멀티 지갑

현재 세션의 `constraints` 필드(JSON)는 **세션 전체에 적용**된다 (지갑별 분리 없음). 지갑별 제한은 기존 **정책(policies)** 으로 관리한다. constraints는 세션 레벨 제약(시간 제한, 총 트랜잭션 수 등)을 담당한다.

### 3. 자기 발견 엔드포인트

```
GET /v1/connect-info    (sessionAuth)
```

세션 토큰만으로 에이전트가 자기 상황을 파악하는 엔드포인트:

```typescript
// 응답 예시
{
  "session": {
    "id": "sess_abc123",
    "expiresAt": 1740787200,
    "source": "api"
  },
  "wallets": [
    {
      "id": "wallet-1",
      "name": "Solana Main",
      "chain": "solana",
      "environment": "mainnet",
      "defaultNetwork": "mainnet-beta",
      "address": "ABC...xyz",
      "isDefault": true
    },
    {
      "id": "wallet-2",
      "name": "Ethereum",
      "chain": "evm",
      "environment": "mainnet",
      "defaultNetwork": "ethereum-mainnet",
      "address": "0x123...abc",
      "isDefault": false
    }
  ],
  "policies": {
    "wallet-1": [
      { "type": "TRANSFER_LIMIT", "maxAmountPerTx": "1.0" },
      { "type": "ALLOWED_TOKENS", "tokens": ["SOL", "USDC"] }
    ],
    "wallet-2": [
      { "type": "TRANSFER_LIMIT", "maxAmountPerTx": "0.1" }
    ]
  },
  "capabilities": [
    "transfer", "token_transfer", "sign", "balance", "assets",
    "actions", "x402"
  ],
  "daemon": {
    "version": "2.4.0",
    "baseUrl": "http://localhost:3100"
  },
  "prompt": "You are connected to WAIaaS daemon v2.4.0. You have access to 2 wallets..."
}
```

**capabilities 동적 결정**: capabilities는 정적 리스트가 아니라, 세션 연결 지갑과 데몬 설정에 따라 **동적으로 결정**된다:
- `transfer`, `token_transfer`, `balance`, `assets`: 항상 포함 (기본 기능)
- `sign`: 서명 API 활성 시 포함
- `actions`: Action Provider API 키 1개 이상 등록 시 포함
- `x402`: x402 설정 완료 시 포함

**prompt 생성**: 현재 매직워드(`GET /admin/agent-prompt`, masterAuth)의 프롬프트 생성 로직을 **내부 함수로 분리**하여 재사용한다. connect-info의 prompt는 **세션 스코프에 맞게 필터링**된 정보만 포함한다 (세션에 연결된 지갑, 해당 지갑 정책, 사용 가능 capabilities만).

### 4. SDK / MCP / Admin UI 반영

| 컴포넌트 | 변경 내용 |
|----------|----------|
| **@waiaas/sdk** | `createSession({ walletIds })` 파라미터 추가. `getConnectInfo()` 메서드 추가 |
| **MCP 서버** | `connect-info` 도구 추가. 세션 생성 시 멀티 지갑 지원. 기존 MCP 도구에 선택적 `walletId` 파라미터 추가 (미지정 시 기본 지갑) |
| **Admin UI** | 세션 생성 폼에서 다중 지갑 선택 체크박스. 세션 상세에서 연결된 지갑 목록 표시 |
| **CLI** | `waiaas quickset`이 생성하는 세션에 모든 지갑 자동 연결 |
| **Skills** | `quickstart.skill.md`에서 `connect-info` 사용법 안내 추가 |
| **agent-prompt** | `POST /admin/agent-prompt` 라우트가 현재 **지갑당 개별 세션**을 생성하므로(`admin.ts:1940-1966`), 단일 멀티 지갑 세션 + 단일 토큰을 반환하도록 변경. 프롬프트 생성 로직은 connect-info 빌더와 공유 |

#### 알림 이벤트 walletId 처리

현재 `notify('SESSION_CREATED', walletId, ...)` 호출에서 두 번째 파라미터가 walletId이다. 멀티 지갑 세션 생성 시 **기본 지갑의 walletId**로 알림을 발송한다. 지갑 동적 추가/제거 시에는 해당 지갑의 walletId로 `SESSION_WALLET_ADDED` / `SESSION_WALLET_REMOVED` 이벤트를 발송한다.

---

## 신규 에러 코드

`error-codes.ts`에 다음 4개 에러 코드를 추가한다:

| 코드 | 도메인 | HTTP | retryable | 메시지 |
|------|--------|------|-----------|--------|
| `WALLET_ACCESS_DENIED` | SESSION | 403 | false | Wallet not accessible from this session |
| `WALLET_ALREADY_LINKED` | SESSION | 409 | false | Wallet already linked to this session |
| `CANNOT_REMOVE_DEFAULT_WALLET` | SESSION | 400 | false | Cannot remove default wallet (change default first) |
| `SESSION_REQUIRES_WALLET` | SESSION | 400 | false | Session must have at least one wallet |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 세션-지갑 관계 | junction 테이블 (1:N) | API 키처럼 동작. 지갑 동적 추가/제거 가능 |
| 2 | JWT에 지갑 목록 | 넣지 않음 (기본 지갑만) | 지갑 추가/제거 시 토큰 재발급 불필요. DB 기반 동적 관리 |
| 3 | 지갑 지정 방식 | 쿼리 파라미터 `walletId` (선택적) | 미지정 시 기본 지갑 → 하위 호환 유지 |
| 4 | 하위 호환 | walletId 단수 파라미터 계속 허용 | 기존 클라이언트 코드 변경 불필요 |
| 5 | 접근 제어 | session_wallets 테이블 검증 | 세션에 연결되지 않은 지갑 접근 차단 |
| 6 | 자기 발견 인증 | sessionAuth | 마스터 패스워드 불필요. 에이전트가 세션 토큰만으로 자기 파악 |
| 7 | 정책 포함 범위 | 세션 연결 지갑의 정책만 | 에이전트가 자기 제한 사항을 명확히 인지 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 멀티 지갑 세션

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 멀티 지갑 세션 생성 | `POST /v1/sessions { walletIds: [w1, w2] }` → 201 + 두 지갑 접근 가능 assert | [L0] |
| 2 | 기본 지갑 자동 선택 | `GET /v1/wallet/balance` (walletId 미지정) → 기본 지갑 잔액 반환 assert | [L0] |
| 3 | 특정 지갑 지정 | `GET /v1/wallet/balance?walletId=w2` → w2 잔액 반환 assert | [L0] |
| 4 | 미연결 지갑 접근 차단 | `GET /v1/wallet/balance?walletId=w3` (세션에 없는 지갑) → WALLET_ACCESS_DENIED assert | [L0] |
| 5 | 지갑 동적 추가 | `POST /v1/sessions/:id/wallets { walletId: w3 }` → 이후 w3 접근 가능 assert | [L0] |
| 6 | 지갑 동적 제거 | `DELETE /v1/sessions/:id/wallets/w2` → 이후 w2 접근 차단 assert | [L0] |

### 하위 호환

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | 단일 지갑 세션 (기존 방식) | `POST /v1/sessions { walletId: w1 }` → 기존과 동일하게 동작 assert | [L0] |
| 8 | DB 마이그레이션 | 기존 세션 데이터 → session_wallets 이관 후 기존 토큰 유효 assert | [L0] |
| 9 | JWT 하위 호환 | 기존 JWT (`wlt` 클레임) → 새 미들웨어에서 정상 인식 assert | [L0] |

### 자기 발견

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | connect-info 조회 | `GET /v1/connect-info` (sessionAuth) → 지갑 목록 + 정책 + prompt 반환 assert | [L0] |
| 11 | 세션 스코프 필터링 | connect-info → 세션에 연결된 지갑만 포함 (다른 지갑 미노출) assert | [L0] |
| 12 | 정책 반영 | 정책 변경 후 connect-info 재조회 → 최신 정책 반영 assert | [L0] |
| 13 | prompt 생성 | connect-info.prompt에 지갑 주소, 네트워크, 사용 가능 API 포함 assert | [L0] |

### SDK / MCP

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | SDK createSession 멀티 지갑 | `sdk.createSession({ walletIds })` → 멀티 지갑 세션 생성 assert | [L0] |
| 15 | SDK getConnectInfo | `sdk.getConnectInfo()` → ConnectInfo 객체 반환 assert | [L0] |
| 16 | MCP connect-info 도구 | MCP `connect-info` → 자기 발견 정보 반환 assert | [L0] |
| 17 | MCP 지갑 전환 | MCP `send-transfer { walletId: w2 }` → w2에서 전송 assert | [L0] |

### 엣지 케이스

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 18 | 기본 지갑 변경 | `PATCH /v1/sessions/:id/wallets/w2/default` → 이후 walletId 미지정 요청이 w2 사용 assert | [L0] |
| 19 | 기본 지갑 제거 차단 | `DELETE /sessions/:id/wallets/w1` (기본 지갑) → 400 CANNOT_REMOVE_DEFAULT_WALLET assert | [L0] |
| 20 | 마지막 지갑 제거 차단 | 지갑 1개 세션에서 `DELETE` → 400 SESSION_REQUIRES_WALLET assert | [L0] |
| 21 | 존재하지 않는 지갑 추가 | `POST /sessions/:id/wallets { walletId: "invalid" }` → 404 WALLET_NOT_FOUND assert | [L0] |
| 22 | capabilities 동적 결정 | x402 미설정 → connect-info.capabilities에 "x402" 미포함 assert | [L0] |

### 보안

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 23 | 크로스 세션 접근 차단 | 세션 A 토큰으로 세션 B 전용 지갑 접근 → WALLET_ACCESS_DENIED assert | [L0] |
| 24 | 만료 토큰 connect-info 거부 | 만료된 세션 토큰으로 `GET /v1/connect-info` → 401 assert | [L0] |
| 25 | 세션-지갑 관리 API 권한 검증 | sessionAuth로 `POST /v1/sessions/:id/wallets` → 403 (masterAuth 전용) assert | [L0] |
| 26 | 지갑 제거 즉시 반영 | 지갑 제거 직후 동일 세션 토큰으로 해당 지갑 트랜잭션 → WALLET_ACCESS_DENIED assert | [L0] |

### DB 마이그레이션

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 27 | 대량 이관 정합성 | 세션 100개 생성 → 마이그레이션 → session_wallets 행 수 = 세션 수 assert | [L0] |
| 28 | is_default 불변량 | 마이그레이션 후 모든 세션에 `is_default = 1` 행이 정확히 1개 assert | [L0] |
| 29 | wallet_id NULL 방어 | wallet_id가 NULL인 비정상 세션 → 마이그레이션 시 스킵 또는 정리, 크래시 없음 assert | [L0] |
| 30 | 이관 실패 롤백 | 마이그레이션 중간 에러 주입 → 트랜잭션 롤백, 기존 데이터 무손상 assert | [L0] |

### 기존 기능 회귀

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 31 | 단일 지갑 트랜잭션 (기존 플로우) | 단일 지갑 세션으로 `POST /v1/transactions/send` → 기존과 동일하게 성공 assert | [L0] |
| 32 | 단일 지갑 정책 평가 | 단일 지갑 세션 + TRANSFER_LIMIT 정책 → 한도 초과 시 DELAY/APPROVAL 동작 assert | [L0] |
| 33 | MCP 기존 도구 하위 호환 | MCP `send-transfer` (walletId 미지정) → 기본 지갑으로 정상 전송 assert | [L0] |
| 34 | Admin UI 세션 목록 | 멀티 지갑 세션 생성 후 Admin 세션 목록에 정상 표시 + 지갑 수 표시 assert | [L0] |

### 동시성

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 35 | 동시 지갑 추가/제거 | 같은 세션에 지갑 추가와 제거를 동시 실행 → DB 정합성 유지 assert | [L1] |
| 36 | 지갑 제거 중 트랜잭션 | 지갑 제거 요청과 해당 지갑 트랜잭션 동시 발생 → 둘 중 하나 실패, 비정합 없음 assert | [L1] |

---

## 단위 테스트 방침

E2E 시나리오 외에 다음 핵심 함수의 단위 테스트를 작성한다:

| 대상 | 테스트 포인트 |
|------|-------------|
| `resolveWalletId` 헬퍼 | 쿼리 파라미터 우선순위, 기본 지갑 폴백, 미연결 지갑 에러 |
| `session_wallets` CRUD | 추가/제거/기본 변경, is_default 불변량 보장 |
| connect-info 빌더 | 지갑 필터링, 정책 매핑, capabilities 동적 결정, prompt 생성 |
| JWT 파싱 (하위 호환) | 기존 `wlt` 클레임 → 새 미들웨어에서 defaultWalletId로 매핑 |
| 세션 생성 (walletId/walletIds) | 단수/복수 파라미터 정규화, defaultWalletId 자동 선택 |

---

## 문서 업데이트

m26-04 완료 시 다음 문서를 갱신한다:

| 문서 | 변경 내용 |
|------|----------|
| `docs/wallet-sdk-integration.md` | connect-info 사용법, 멀티 지갑 세션 설정 가이드 추가 |
| `skills/quickstart.skill.md` | 에이전트 자기 발견 워크플로우 (`GET /v1/connect-info`) 안내 추가 |
| `skills/wallet.skill.md` | `walletId` 쿼리 파라미터 사용법, 멀티 지갑 예시 추가 |
| `skills/admin.skill.md` | 세션 생성 시 `walletIds` 파라미터, 세션-지갑 동적 관리 API 추가 |
| `packages/sdk/README.md` | `createSession({ walletIds })`, `getConnectInfo()` 메서드 문서화 |
| `docs/guides/openclaw-integration.md` | `WAIAAS_MASTER_PASSWORD` 설정 항목 제거, 세션 토큰만으로 연동하도록 변경 |
| `docs/guides/claude-code-integration.md` | 마스터 패스워드 의존 제거, connect-info 기반 자기 발견 안내 추가 |
| `docs/guides/agent-skills-integration.md` | 에이전트 환경 변수에서 마스터 패스워드 제거, 세션 토큰 단독 설정으로 변경 |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.2 (세션 인프라) | sessions 테이블, JWT 발급/검증, session-auth 미들웨어 |
| v2.0 (정책 엔진) | 정책 조회 API, 지갑별 정책 필터링 |

> m26-01~03과 독립적. 병렬 진행 가능.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 폭발 반경 증가 | 토큰 1개 유출 시 연결된 모든 지갑 노출 | 지갑별 정책이 여전히 적용. Kill Switch로 즉시 차단 가능 |
| 2 | DB 마이그레이션 복잡도 | 기존 세션 데이터 이관 실패 시 서비스 중단 | sessions.wallet_id → session_wallets 자동 이관 + 롤백 지원 |
| 3 | API 하위 호환 파손 | 기존 클라이언트(SDK, MCP, CLI) 동작 불가 | walletId 단수 파라미터 유지, 기본 지갑 자동 선택으로 기존 코드 무변경 |
| 4 | JWT 크기 증가 | 지갑 목록을 JWT에 넣으면 토큰 비대화 | JWT에는 기본 지갑만 포함, 전체 목록은 DB 조회 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (설계 → 세션 모델 → API 변경 → 자기 발견 + SDK/MCP) |
| 신규 파일 | 3-5개 (junction 스키마, resolveWalletId 헬퍼, connect-info 라우트, SDK 메서드) |
| 수정 파일 | 15-20개 (세션 CRUD, 미들웨어, 전체 /v1/wallet/* 라우트, SDK, MCP, Admin UI, CLI) |
| 테스트 | 36개 (E2E) + 단위 테스트 5대상 |
| DB 마이그레이션 | 1건 (session_wallets 테이블 + 기존 데이터 이관) |

---

*생성일: 2026-02-20*
*선행: v1.2 (세션 인프라), v2.0 (정책 엔진)*
*관련: 이슈 없음 (신규 설계)*
