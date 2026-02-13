# BUG-002: 세션 라우트 미등록 + masterAuth 미적용 (POST /v1/sessions 404)

## 심각도

**CRITICAL** — 세션 생성 불가로 v1.2 인증 체계 전체가 동작하지 않음

## 증상

데몬 정상 시작 후 `POST /v1/sessions` 호출 시 `404 Not Found` 반환.
`/health`, `/v1/agents`, `/v1/wallet/balance` 등 다른 라우트는 정상 동작.
추가로 masterAuth 미들웨어도 미적용되어 `/v1/agents`, `/v1/policies` 등이 인증 없이 접근 가능.

## 재현 방법

```bash
# 1. 데몬 시작
waiaas start
# 마스터 비밀번호 입력: test1234

# 2. 에이전트 생성 (정상 동작 — 단, masterAuth 없이도 통과)
curl -X POST http://127.0.0.1:3100/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"test-agent","chain":"solana","network":"devnet"}'

# 3. 세션 생성 시도 (404 발생)
curl -X POST http://127.0.0.1:3100/v1/sessions \
  -H "X-Master-Password: test1234" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"019c476e-fc02-75aa-b598-c114c8f3aadc"}'
# → 404 Not Found
```

데몬 로그에는 Step 1~6 모두 정상 출력됨.

## 원인

`packages/daemon/src/lifecycle/daemon.ts` Step 5에서 `createApp()` 호출 시 **2개 의존성 누락**:

```typescript
// daemon.ts (263-273행)
const app = createApp({
  db: this._db!,
  sqlite: this.sqlite ?? undefined,
  keyStore: this.keyStore!,
  masterPassword: this.masterPassword,
  config: this._config!,
  adapter: this.adapter,
  policyEngine: new DatabasePolicyEngine(this._db!, this.sqlite ?? undefined),
  delayQueue: this.delayQueue ?? undefined,
  approvalWorkflow: this.approvalWorkflow ?? undefined,
  // ❌ jwtSecretManager 누락 → 세션 라우트 미등록
  // ❌ masterPasswordHash 누락 → masterAuth 미들웨어 미적용
});
```

### 누락 1: jwtSecretManager

`packages/daemon/src/api/server.ts` (144-153행)에서 세션 라우트 등록 조건:

```typescript
if (deps.db && deps.jwtSecretManager && deps.config) {
  app.route('/v1', sessionRoutes({ ... }));
}
// jwtSecretManager === undefined → 조건 false → 세션 라우트 미등록 → 404
```

동시에 sessionAuth 미들웨어도 미적용 (111-117행):

```typescript
if (deps.jwtSecretManager && deps.db) {
  const sessionAuth = createSessionAuth({ ... });
  app.use('/v1/sessions/:id/renew', sessionAuth);
  app.use('/v1/wallet/*', sessionAuth);
  app.use('/v1/transactions/*', sessionAuth);
}
// → sessionAuth 없이 wallet/transactions 라우트가 인증 없이 노출
```

### 누락 2: masterPasswordHash

`server.ts` (88-103행)에서 masterAuth 미들웨어 등록 조건:

```typescript
if (deps.masterPasswordHash !== undefined) {
  const masterAuth = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
  app.use('/v1/agents', masterAuth);
  app.use('/v1/policies', masterAuth);
  app.use('/v1/sessions', masterAuth);
  // ...
}
// masterPasswordHash === undefined → masterAuth 미적용 → 모든 관리 API 무인증 접근 가능
```

## 영향 범위

| 라우트 | 영향 |
|--------|------|
| `POST /v1/sessions` | 404 — 세션 생성 불가 |
| `GET /v1/sessions` | 404 — 세션 목록 불가 |
| `DELETE /v1/sessions/:id` | 404 — 세션 폐기 불가 |
| `PUT /v1/sessions/:id/renew` | 404 — 세션 갱신 불가 |
| `/v1/wallet/*` | sessionAuth 미적용 — 토큰 없이 접근 가능 |
| `/v1/transactions/*` | sessionAuth 미적용 — 토큰 없이 접근 가능 |
| `/v1/agents` | masterAuth 미적용 — 비밀번호 없이 에이전트 생성 가능 |
| `/v1/policies` | masterAuth 미적용 — 비밀번호 없이 정책 관리 가능 |

## 수정안

`packages/daemon/src/lifecycle/daemon.ts` 수정 3곳:

### 1. JwtSecretManager import 및 인스턴스 생성

Step 4b(워크플로 생성) 이후 또는 Step 5 직전에 JwtSecretManager를 초기화:

```typescript
import { JwtSecretManager } from '../infrastructure/jwt/index.js';

// Step 4c: JWT Secret Manager 초기화
const jwtSecretManager = new JwtSecretManager({
  db: this._db!,
  rotationIntervalSec: this._config!.security.jwt_rotation_interval,
});
await jwtSecretManager.getCurrentSecret(); // 첫 시크릿 생성/로드
this.jwtSecretManager = jwtSecretManager;
```

### 2. masterPasswordHash 생성

마스터 비밀번호를 Argon2id로 해싱하여 전달:

```typescript
import { hashPassword } from '../infrastructure/crypto/argon2.js';

// Step 1 또는 Step 3에서 해시 생성
const masterPasswordHash = await hashPassword(masterPassword);
this.masterPasswordHash = masterPasswordHash;
```

### 3. createApp 호출 시 두 의존성 전달

```typescript
const app = createApp({
  db: this._db!,
  sqlite: this.sqlite ?? undefined,
  keyStore: this.keyStore!,
  masterPassword: this.masterPassword,
  masterPasswordHash: this.masterPasswordHash,  // ← 추가
  config: this._config!,
  adapter: this.adapter,
  policyEngine: new DatabasePolicyEngine(this._db!, this.sqlite ?? undefined),
  jwtSecretManager: this.jwtSecretManager!,      // ← 추가
  delayQueue: this.delayQueue ?? undefined,
  approvalWorkflow: this.approvalWorkflow ?? undefined,
});
```

## 기존 테스트가 통과한 이유

BUG-001과 동일한 패턴. 모든 테스트(`api-sessions.test.ts`, `session-auth.test.ts`, `session-lifecycle-e2e.test.ts` 등)가 `createApp()`을 직접 호출하면서 `jwtSecretManager`와 `masterPasswordHash`를 명시적으로 전달:

```typescript
// 테스트 코드 (예: api-sessions.test.ts)
const app = createApp({
  db,
  jwtSecretManager,           // ← 테스트에서는 직접 전달
  masterPasswordHash: hash,   // ← 테스트에서는 직접 전달
  config,
});
```

실제 `DaemonLifecycle.start()` → `createApp()` 경로는 테스트되지 않았기 때문에 누락이 발견되지 않음.

## 추가 자동화 테스트

### 1. DaemonLifecycle 통합 테스트 (필수)

`DaemonLifecycle.start()` 이후 실제 HTTP 호출로 전체 라우트 등록 여부를 검증:

```typescript
describe('DaemonLifecycle route registration', () => {
  it('세션 라우트가 등록되어 POST /v1/sessions가 404가 아닌 응답을 반환', async () => {
    const daemon = new DaemonLifecycle();
    await daemon.start(tmpDir, 'test-password');
    const res = await fetch('http://127.0.0.1:3100/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': 'test-password',
      },
      body: JSON.stringify({ agentId: 'nonexistent' }),
    });
    // 404가 아닌 400/422(유효성 실패) 또는 200이면 라우트 등록됨
    expect(res.status).not.toBe(404);
    await daemon.shutdown('TEST');
  });

  it('masterAuth가 적용되어 비밀번호 없이 POST /v1/agents 접근 시 401', async () => {
    const daemon = new DaemonLifecycle();
    await daemon.start(tmpDir, 'test-password');
    const res = await fetch('http://127.0.0.1:3100/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test', chain: 'solana', network: 'devnet' }),
    });
    expect(res.status).toBe(401);
    await daemon.shutdown('TEST');
  });

  it('sessionAuth가 적용되어 토큰 없이 GET /v1/wallet/balance 접근 시 401', async () => {
    const daemon = new DaemonLifecycle();
    await daemon.start(tmpDir, 'test-password');
    const res = await fetch('http://127.0.0.1:3100/v1/wallet/balance');
    expect(res.status).toBe(401);
    await daemon.shutdown('TEST');
  });
});
```

### 2. createApp deps 완전성 검증 테스트 (권장)

`createApp()`에 전달되는 deps 객체가 모든 필수 키를 포함하는지 타입 레벨이 아닌 런타임에서 검증:

```typescript
it('createApp에 jwtSecretManager 누락 시 세션 라우트가 등록되지 않음을 경고', () => {
  const app = createApp({ db, config }); // jwtSecretManager 누락
  // /v1/sessions 라우트 존재 여부를 app.routes에서 확인
  const sessionRoute = app.routes.find(r => r.path === '/v1/sessions');
  expect(sessionRoute).toBeUndefined(); // 현재 동작 확인 (경고 로그 추가 근거)
});
```

### 3. BUG-001 재발 방지 패턴 일반화 (권장)

`createApp()`의 조건부 라우트 등록 패턴이 반복되고 있으므로, 미등록된 라우트에 접근 시 `404` 대신 `503 Service Unavailable` + 원인 메시지를 반환하는 방어 코드 검토:

```typescript
// 예: 세션 라우트 미등록 시 명시적 503
if (!deps.jwtSecretManager) {
  app.all('/v1/sessions*', (c) =>
    c.json({ error: 'Session service unavailable: jwtSecretManager not configured' }, 503)
  );
}
```

---

*발견일: 2026-02-10*
*수정일: 2026-02-10*
*마일스톤: v1.2*
*상태: FIXED*
*관련: BUG-001 (동일 패턴 — createApp deps 누락)*

## 수정 내역

`packages/daemon/src/lifecycle/daemon.ts` 수정 4곳:

1. **import 추가:** `JwtSecretManager` (from `../infrastructure/jwt/index.js`) + `argon2`
2. **프라이빗 필드 추가:** `jwtSecretManager: JwtSecretManager | null`, `masterPasswordHash: string`
3. **Step 4c 추가:** DB 초기화 후 `JwtSecretManager` 생성+초기화, `argon2.hash(masterPassword, argon2id)` 실행
4. **createApp() deps 전달:** `masterPasswordHash`, `jwtSecretManager` 두 필드 추가
5. **shutdown 정리:** `masterPasswordHash` 메모리 클리어 추가

검증: 전체 37 파일, 457 테스트 통과.
