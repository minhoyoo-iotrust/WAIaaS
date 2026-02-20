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

`sessions.wallet_id` 컬럼은 **마이그레이션 과정에서 제거**:
1. `session_wallets`에 기존 `sessions.wallet_id` 데이터 이관 (`is_default = 1`)
2. `sessions.wallet_id` 컬럼 삭제

#### JWT 변경

| 항목 | Before | After |
|------|--------|-------|
| `wlt` 클레임 | 단일 walletId | **기본 walletId** (하위 호환) |
| 지갑 목록 | JWT에 없음 | **DB 조회** (session_wallets) |

> JWT에 지갑 배열을 넣지 않는 이유: 지갑 추가/제거 시 토큰 재발급이 필요해짐. DB 기반이면 동적 변경 가능.

#### Session Auth 미들웨어 변경

```typescript
// Before (session-auth.ts)
c.set('walletId', payload.wlt);  // JWT에서 단일 지갑

// After
c.set('sessionId', payload.sub);
c.set('defaultWalletId', payload.wlt);  // 기본 지갑 (하위 호환)
// walletId는 요청 파라미터 또는 기본 지갑에서 결정
```

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
// 미들웨어 또는 헬퍼
function resolveWalletId(c: Context): string {
  const requested = c.req.query('walletId') ?? c.req.body?.walletId;
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
POST   /v1/sessions/:id/wallets     { walletId }        → 지갑 추가 (masterAuth)
DELETE /v1/sessions/:id/wallets/:walletId                → 지갑 제거 (masterAuth)
GET    /v1/sessions/:id/wallets                          → 연결된 지갑 목록 (masterAuth)
```

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
    "expiresAt": "2026-03-01T00:00:00Z",
    "source": "api"
  },
  "wallets": [
    {
      "id": "wallet-1",
      "name": "Solana Main",
      "chain": "solana",
      "network": "mainnet-beta",
      "address": "ABC...xyz",
      "isDefault": true
    },
    {
      "id": "wallet-2",
      "name": "Ethereum",
      "chain": "evm",
      "network": "ethereum-mainnet",
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

`prompt` 필드에는 현재 매직워드(`/admin/agent-prompt`)와 유사한 자연어 프롬프트가 포함되지만, **세션 스코프에 맞게 필터링**된 정보만 제공한다.

### 4. SDK / MCP / Admin UI 반영

| 컴포넌트 | 변경 내용 |
|----------|----------|
| **@waiaas/sdk** | `createSession({ walletIds })` 파라미터 추가. `getConnectInfo()` 메서드 추가 |
| **MCP 서버** | `connect-info` 도구 추가. 세션 생성 시 멀티 지갑 지원 |
| **Admin UI** | 세션 생성 폼에서 다중 지갑 선택 체크박스. 세션 상세에서 연결된 지갑 목록 표시 |
| **CLI** | `waiaas quickset`이 생성하는 세션에 모든 지갑 자동 연결 |
| **Skills** | `quickstart.skill.md`에서 `connect-info` 사용법 안내 추가 |

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
| 테스트 | 16개 |
| DB 마이그레이션 | 1건 (session_wallets 테이블 + 기존 데이터 이관) |

---

*생성일: 2026-02-20*
*선행: v1.2 (세션 인프라), v2.0 (정책 엔진)*
*관련: 이슈 없음 (신규 설계)*
