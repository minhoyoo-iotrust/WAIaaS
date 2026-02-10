# BUG-001: 트랜잭션 라우트 미등록 (POST /v1/transactions/send 404)

## 심각도

**HIGH** — 핵심 기능(SOL 전송)이 동작하지 않음

## 증상

데몬 정상 시작 후 `POST /v1/transactions/send` 호출 시 `404 Not Found` 반환.
다른 라우트(`/health`, `/v1/agents`, `/v1/wallet/balance`)는 정상 동작.

## 재현 방법

```bash
# 1. 데몬 시작
WAIAAS_MASTER_PASSWORD=test1234 node packages/cli/bin/waiaas start

# 2. 에이전트 생성 (정상 동작)
curl -X POST http://127.0.0.1:3100/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"test-agent","chain":"solana","network":"devnet"}'

# 3. 트랜잭션 전송 시도 (404 발생)
curl -X POST http://127.0.0.1:3100/v1/transactions/send \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: 에이전트ID" \
  -d '{"to":"임의주소","amount":"100000000"}'
# → 404 Not Found
```

데몬 로그에는 Step 1~6 모두 정상:
```
Step 1: Config loaded, daemon lock acquired
Step 2: Database initialized
Step 3: Keystore infrastructure verified (master password provided)
Step 4: SolanaAdapter connected to https://api.devnet.solana.com
Step 5: HTTP server listening on 127.0.0.1:3100
Step 6: Workers started, PID file written
WAIaaS daemon ready (PID: 36966)
```

## 원인

`packages/daemon/src/lifecycle/daemon.ts` Step 5에서 `createApp()`을 호출할 때 `policyEngine`을 전달하지 않음.

```typescript
// daemon.ts (243-249행)
const app = createApp({
  db: this._db!,
  keyStore: this.keyStore!,
  masterPassword: this.masterPassword,
  config: this._config!,
  adapter: this.adapter,
  // ← policyEngine 누락
});
```

`packages/daemon/src/api/server.ts` (116-134행)에서 트랜잭션 라우트 등록 조건:

```typescript
if (
  deps.db &&
  deps.keyStore &&
  deps.masterPassword !== undefined &&
  deps.adapter &&
  deps.policyEngine    // ← undefined이므로 조건 false → 라우트 미등록 → 404
) {
  app.route('/v1', transactionRoutes({ ... }));
}
```

`DefaultPolicyEngine` 클래스는 이미 구현되어 있으나(`packages/daemon/src/pipeline/default-policy-engine.ts`), daemon lifecycle에서 인스턴스를 생성하여 전달하는 코드가 빠져있음.

## 수정안

`packages/daemon/src/lifecycle/daemon.ts` 수정 2곳:

### 1. import 추가

```typescript
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
```

### 2. createApp 호출 시 policyEngine 전달

```typescript
const app = createApp({
  db: this._db!,
  keyStore: this.keyStore!,
  masterPassword: this.masterPassword,
  config: this._config!,
  adapter: this.adapter,
  policyEngine: new DefaultPolicyEngine(),  // ← 추가
});
```

## 영향 범위

- `POST /v1/transactions/send` (SOL 전송)
- `GET /v1/transactions/:id` (트랜잭션 조회) — 같은 조건 블록 안에 있으므로 역시 404

## 기존 테스트가 통과한 이유

E2E 테스트(`e2e-transaction.test.ts`)는 자체적으로 `createApp()`을 호출할 때 `policyEngine: new DefaultPolicyEngine()`을 직접 전달하고 있어서 테스트에서는 라우트가 정상 등록됨. 실제 daemon lifecycle 경로에서만 누락.

## 추가 조치 (권장)

daemon lifecycle 경로를 통한 통합 테스트 추가 — `startDaemon()` → HTTP 호출로 트랜잭션 전송까지 검증하는 E2E 테스트가 있으면 이 유형의 누락을 방지할 수 있음.

---

*발견일: 2026-02-10*
*마일스톤: v1.1*
*상태: FIXED*
*수정일: 2026-02-10*
*수정 내용: daemon.ts에서 DatabasePolicyEngine 인스턴스 생성 및 sqlite 전달 추가*
