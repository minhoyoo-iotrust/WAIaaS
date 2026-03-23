# #423 — Admin UI RPC 설정 Save 후 빌트인 fallback URL이 사라짐

- **유형**: BUG
- **심각도**: MEDIUM
- **영향 범위**: 모든 네트워크 (Solana + EVM 전체)
- **컴포넌트**: `packages/admin/src/pages/wallets.tsx`

## 현상

Admin UI에서 RPC URL을 추가하고 Save하면, 기존 빌트인 fallback URL(예: `api.mainnet-beta.solana.com`, `rpc.ankr.com/solana`, `solana.drpc.org`)이 UI에서 사라진다. Save 전에는 유저 URL + builtin URL이 함께 표시되지만, Save 후에는 유저 URL만 남는다.

이 현상은 Solana mainnet뿐 아니라 **모든 네트워크(Solana + EVM 전체)**에 동일하게 적용된다. 특정 네트워크의 RPC를 하나만 추가해도 Save 후 다른 네트워크의 builtin URL도 UI에서 안 보인다.

## 영향

- **UI만 영향**: 실제 RpcPool에는 builtin fallback이 정상 등록되어 있으므로 런타임 동작에는 문제 없음
- **UX 혼란**: 관리자가 fallback RPC가 없다고 오해할 수 있음
- **Admin Settings DB에 저장된 유저 RPC는 영향 없음**: 데몬 재시작/재접속 시 builtin이 다시 표시됨 (초기 로드에서는 정상 전달)

## 원인

`wallets.tsx` 2593행에서 Save 후 `buildUrlEntries(resultSettings)` 호출 시 두 번째 인자 `builtinDefaults`를 전달하지 않아 기본값 빈 객체(`{}`)가 사용된다.

```typescript
// 2493행 — 초기 로드: builtin 정상 전달
const entries = buildUrlEntries(result, builtinRpcUrls.value);  // ✅

// 2593행 — Save 후: builtin 누락
const newEntries = buildUrlEntries(resultSettings);  // ❌ builtinRpcUrls.value 누락
```

`buildUrlEntries`는 `builtinDefaults` 파라미터의 URL 목록을 유저 URL 뒤에 append하는데, 빈 객체가 전달되면 append할 builtin이 없어서 유저 URL만 남는다.

## 수정 방향

`wallets.tsx` 2593행에서 `builtinRpcUrls.value`를 두 번째 인자로 전달:

```typescript
const newEntries = buildUrlEntries(resultSettings, builtinRpcUrls.value);
```

## 테스트 항목

- [ ] RPC URL 추가 후 Save → builtin fallback URL이 유저 URL 아래에 유지됨
- [ ] 특정 네트워크만 수정해도 다른 네트워크의 builtin URL이 사라지지 않음
- [ ] 페이지 새로고침 후에도 유저 URL + builtin URL 정상 표시
- [ ] builtin URL 삭제 후 Save → 삭제 상태 유지 (builtin이 강제 복원되지 않음)
