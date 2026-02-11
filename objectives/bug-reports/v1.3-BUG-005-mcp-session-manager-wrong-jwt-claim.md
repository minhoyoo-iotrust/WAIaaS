# BUG-005: MCP SessionManager가 JWT의 `sub` 클레임 대신 `sessionId` 클레임을 참조

## 심각도

**CRITICAL** — MCP 서버가 유효한 토큰을 로드하지 못해 모든 도구 호출이 `session_expired` 반환. Claude Desktop 연동 완전 불가.

## 증상

`waiaas mcp setup`으로 토큰을 정상 발급하고 Claude Desktop을 재시작해도, 모든 MCP 도구 호출 시 다음 응답 반환:

```json
{
  "session_expired": true,
  "message": "Session token not available",
  "action": "Run waiaas mcp setup to get a new token"
}
```

MCP 서버 로그(`~/Library/Logs/Claude/mcp-server-waiaas-wallet.log`):

```
[waiaas-mcp:session] JWT missing sessionId claim
[waiaas-mcp:session] Started in error state (degraded mode)
[waiaas-mcp:session] Starting recovery loop (polling every 60s)
```

## 재현 방법

```bash
# 1. 데몬 실행
WAIAAS_MASTER_PASSWORD=test1234 node packages/cli/dist/index.js start --data-dir ~/.waiaas

# 2. MCP 토큰 발급
node packages/cli/dist/index.js mcp setup \
  --password test1234 \
  --agent 019c47d6-51ef-7f43-a76b-d50e875d95f4 \
  --data-dir ~/.waiaas

# 3. 발급된 JWT payload 확인
cat ~/.waiaas/mcp-token | cut -d'.' -f2 | base64 -d
# → {"sub":"019c4af6-...","agt":"019c47d6-...","iat":...,"exp":...}
#    ^^^ 세션 ID가 'sub' 클레임에 저장됨

# 4. Claude Desktop 재시작 후 아무 도구 호출
# → "session_expired" 반환
```

## 원인

### 데몬 측 (JWT 생성) — 정상

`packages/daemon/src/api/routes/sessions.ts` 193-199행에서 JWT 표준에 따라 `sub` 클레임에 세션 ID를 저장:

```typescript
const jwtPayload: JwtPayload = {
  sub: sessionId,    // ← JWT 표준 'sub' (subject) 사용
  agt: parsed.agentId,
  iat: nowSec,
  exp: expiresAt,
};
```

### MCP 측 (JWT 파싱) — 버그

`packages/mcp/src/session-manager.ts` 189-195행에서 비표준 `sessionId` 클레임을 참조:

```typescript
// Extract sessionId
const sessionId = payload['sessionId'];   // ❌ 'sessionId' 클레임 없음
if (typeof sessionId !== 'string' || !sessionId) {
  this.state = 'error';
  console.error(`${LOG_PREFIX} JWT missing sessionId claim`);
  return false;                            // ← 여기서 항상 실패
}
```

실제 JWT payload:

```json
{
  "sub": "019c4af6-400f-719d-89f6-41de8c8e4288",
  "agt": "019c47d6-51ef-7f43-a76b-d50e875d95f4",
  "iat": 1770784178,
  "exp": 1770870578
}
```

`payload['sessionId']`는 `undefined` → 조건문에서 항상 `false` → error 상태 진입.

## 영향 범위

| 항목 | 영향 |
|------|------|
| MCP 도구 6개 | 전부 `session_expired` 반환 |
| MCP 리소스 3개 | 전부 에러 반환 |
| Claude Desktop 연동 | 완전 불가 |
| SessionManager 자동 갱신 | 토큰 로드 단계에서 실패하여 갱신 로직 도달 불가 |

## 수정안

`packages/mcp/src/session-manager.ts` 189-191행 수정:

```typescript
// Before
const sessionId = payload['sessionId'];
if (typeof sessionId !== 'string' || !sessionId) {
  this.state = 'error';
  console.error(`${LOG_PREFIX} JWT missing sessionId claim`);
  return false;
}

// After — JWT 표준 'sub' 클레임 우선, 하위 호환 'sessionId' 폴백
const sessionId = payload['sub'] ?? payload['sessionId'];
if (typeof sessionId !== 'string' || !sessionId) {
  this.state = 'error';
  console.error(`${LOG_PREFIX} JWT missing sub/sessionId claim`);
  return false;
}
```

`sub`를 우선하되 `sessionId` 폴백을 유지하면, 향후 JWT 구조 변경에도 하위 호환 보장.

## 기존 테스트가 통과한 이유

`packages/mcp/__tests__/session-manager.test.ts`에서 테스트용 JWT를 직접 구성할 때 `sessionId` 클레임을 사용:

```typescript
// 테스트 코드에서 JWT를 직접 생성
const payload = {
  sessionId: 'test-session-id',  // ← 테스트에서만 사용하는 비표준 클레임
  exp: Math.floor(Date.now() / 1000) + 3600,
};
```

반면 실제 데몬의 `sessions.ts`는 `sub` 클레임을 사용. 테스트와 실제 코드 간 JWT 구조 불일치로 인해 통합 시 발견됨.

## 재발 방지 테스트

### 1. SessionManager 테스트: 실제 JWT 구조 사용 (필수)

기존 테스트의 JWT payload를 실제 데몬이 생성하는 구조로 변경:

```typescript
describe('SessionManager - JWT claim compatibility', () => {
  it('sub 클레임에서 sessionId를 추출한다', () => {
    // 실제 데몬이 생성하는 JWT 구조
    const payload = {
      sub: 'session-123',
      agt: 'agent-456',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createTestJwt(payload);

    sessionManager.applyToken(token);

    expect(sessionManager.getState()).toBe('active');
    expect(sessionManager.getToken()).toBe(token);
  });

  it('sessionId 클레임도 폴백으로 지원한다 (하위 호환)', () => {
    const payload = {
      sessionId: 'session-789',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createTestJwt(payload);

    sessionManager.applyToken(token);

    expect(sessionManager.getState()).toBe('active');
  });

  it('sub와 sessionId 모두 없으면 error 상태로 전환된다', () => {
    const payload = {
      agt: 'agent-456',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createTestJwt(payload);

    sessionManager.applyToken(token);

    expect(sessionManager.getState()).toBe('error');
  });
});
```

### 2. JWT 구조 일관성 통합 테스트 (권장)

데몬의 `POST /v1/sessions`가 반환하는 JWT를 MCP SessionManager로 파싱하는 E2E 테스트:

```typescript
describe('JWT claim consistency (daemon ↔ MCP)', () => {
  it('데몬이 생성한 JWT를 MCP SessionManager가 정상 파싱한다', async () => {
    // 1. 데몬 API로 세션 생성
    const res = await fetch('http://127.0.0.1:3100/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': 'test1234',
      },
      body: JSON.stringify({ agentId: testAgentId, expiresIn: 3600 }),
    });
    const { token } = await res.json();

    // 2. MCP SessionManager로 토큰 로드
    const sm = new SessionManager({ baseUrl, envToken: token });
    await sm.start();

    // 3. 상태 확인
    expect(sm.getState()).toBe('active');
    expect(sm.getToken()).toBe(token);
  });
});
```

### 3. JWT Payload 타입 공유 (권장)

`@waiaas/core`에 JWT payload 타입을 정의하여 데몬과 MCP가 동일한 클레임 이름을 참조하도록 강제:

```typescript
// packages/core/src/types/jwt.ts
export interface WaiaasJwtPayload {
  sub: string;   // session ID
  agt: string;   // agent ID
  iat: number;
  exp: number;
}
```

---

*발견일: 2026-02-11*
*마일스톤: v1.3*
*상태: FIXED*
*수정일: 2026-02-11*
*관련: BUG-003, BUG-004 (같은 mcp setup 흐름에서 발견)*
