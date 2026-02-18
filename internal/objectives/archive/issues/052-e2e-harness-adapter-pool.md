# v1.7-052: E2E 하네스가 AdapterPool 대신 단일 adapter 전달 — 3건 실패

- **유형**: BUG
- **심각도**: HIGH
- **마일스톤**: v1.7
- **상태**: OPEN
- **발견일**: 2026-02-17

## 설명

`packages/cli/src/__tests__/helpers/daemon-harness.ts`의 `startTestDaemonWithAdapter()`가 `adapter: adapter as unknown as IChainAdapter`를 `createApp()`에 전달하지만, 멀티체인 마일스톤(v1.4.6) 이후 `CreateAppDeps`에는 `adapter` 필드가 없고 `adapterPool: AdapterPool`을 기대한다. 전달된 `adapter` 키가 무시되어 라우트 등록이 실패한다.

## 실패 테스트 (3건)

| 테스트 | 기대 | 실제 | 원인 |
|--------|------|------|------|
| E-07: GET /v1/wallet/balance | 200 | 502 | `walletRoutes`에서 `adapterPool`이 null → CHAIN_ERROR |
| E-08: POST /v1/transactions/send | 201 | 404 | `transactionRoutes` 등록 조건 `deps.adapterPool` 미충족 → 라우트 미등록 |
| E-09: GET /v1/transactions/:id | 200 | 404 | E-08 의존 (동일 원인) |

## 근본 원인

`packages/daemon/src/api/server.ts:308-312`:
```typescript
if (
  deps.db &&
  deps.keyStore &&
  deps.masterPassword !== undefined &&
  deps.adapterPool &&  // ← undefined이므로 falsy → 라우트 미등록
  deps.policyEngine &&
  deps.config
)
```

## 수정 방안

`daemon-harness.ts`의 `startTestDaemonWithAdapter()`에서 MockChainAdapter를 AdapterPool 인터페이스로 감싸서 전달:

```typescript
// Step 4: Mock adapter pool
const adapter = new MockChainAdapter();
const mockAdapterPool = {
  resolve: async () => adapter as unknown as IChainAdapter,
  disconnectAll: async () => {},
  evict: async () => {},
  evictAll: async () => {},
  get size() { return 1; },
};
```

`createApp()` 호출에서:
```typescript
// Before (broken):
adapter: adapter as unknown as IChainAdapter,

// After (fixed):
adapterPool: mockAdapterPool as any,
```

## 영향 범위

- `packages/cli/src/__tests__/helpers/daemon-harness.ts` 1곳 수정
- E2E 테스트 3건 복구 (E-07, E-08, E-09)
