# #421 — RPC Rate Limit / Access 에러 시 유료 RPC 설정 안내 hint 누락

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **영향 시나리오**: defi-08 (Kamino), defi-10 (Drift), 기타 Solana heavy RPC 의존 액션
- **컴포넌트**: `packages/daemon/src/api/routes/actions.ts`

## 현상

Kamino/Drift 등 SDK 기반 DeFi 프로바이더가 Solana RPC 429/403/freetier 에러로 실패할 때, 응답에 원인만 표시되고 **해결 방법(유료 RPC 설정)에 대한 안내가 없다**.

현재 응답:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: Kamino market load failed after 3 retries: 429 Too Many Requests",
  "retryable": true
}
```

AI 에이전트와 관리자 모두 이 에러만으로는 "유료 RPC를 설정해야 한다"는 것을 알 수 없다.

## 기대 응답

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: Kamino market load failed after 3 retries: 429 Too Many Requests",
  "retryable": true,
  "hint": "This action requires heavy RPC calls that exceed free-tier limits. Configure a dedicated Solana RPC endpoint (e.g., Helius, QuickNode) via Admin Settings (rpc.solana_mainnet) or config.toml [rpc] solana_mainnet = \"https://...\"."
}
```

## 수정 방향

### 1. `ACTION_RESOLVE_FAILED` 래핑 시 RPC 에러 감지 + hint 추가

`actions.ts`에서 ChainError를 `ACTION_RESOLVE_FAILED`로 래핑할 때 에러 메시지에서 RPC rate limit / access 패턴을 감지하고 `hint` 필드를 추가한다.

```typescript
const errMsg = err instanceof Error ? err.message : 'Unknown error';
const isRpcLimit = /429|rate.?limit|too many request|freetier|not allowed|api.?key/i.test(errMsg);
const hint = isRpcLimit
  ? 'This action requires heavy RPC calls that exceed free-tier limits. Configure a dedicated Solana RPC endpoint (e.g., Helius, QuickNode) via Admin Settings (rpc.solana_mainnet) or config.toml [rpc] solana_mainnet = "https://...".'
  : undefined;
throw new WAIaaSError('ACTION_RESOLVE_FAILED', {
  message: `Action resolve failed: ${errMsg}`,
  details: { actionKey },
  hint,
  cause: err instanceof Error ? err : undefined,
});
```

### 2. 적용 위치

- `packages/daemon/src/api/routes/actions.ts` — 세션 인증 액션 라우트 (line ~387)
- `packages/daemon/src/api/routes/admin-actions.ts` — 어드민 액션 라우트 (line ~189)

### 3. EVM RPC 에러에도 동일 적용

Solana뿐 아니라 EVM 체인에서도 동일한 패턴이 발생할 수 있으므로, hint 메시지에서 체인을 특정하지 않고 범용적으로 작성한다. 에러 메시지 내 `solana` / `ethereum` 등 체인명이 있으면 해당 체인의 설정 키를 안내한다.

## 테스트 항목

- [x] RPC 429 에러로 `ACTION_RESOLVE_FAILED` 반환 시 `hint` 필드에 RPC 설정 안내 포함
- [x] RPC 403 "API key not allowed" 에러 시 동일 hint 포함
- [x] "freetier" / "method is not available" 에러 시 동일 hint 포함
- [x] RPC 무관 에러(스키마 불일치 등)에는 hint 미포함
- [x] `admin-actions.ts` 라우트에서도 동일하게 동작
