# #424 — Admin UI에서 등록한 RPC URL이 RpcPool에 시딩되지 않음

- **유형**: BUG
- **심각도**: HIGH
- **영향 범위**: 모든 네트워크 — Admin Settings `rpc_pool.*` 경유 등록된 RPC URL 전체
- **컴포넌트**: `packages/daemon/src/lifecycle/daemon-startup.ts` (Step 4 RpcPool 초기화)

## 현상

Admin UI에서 유료 Solana RPC(예: Helius)를 등록하면 DB `rpc_pool.solana-mainnet` 키에 JSON 배열로 저장된다. 그러나 데몬의 RpcPool에는 이 URL이 시딩되지 않아, SDK wrapper(`resolveRpcUrlFromPool`)가 여전히 public RPC만 사용한다.

```
Admin Settings DB: rpc_pool.solana-mainnet = ["https://mainnet.helius-rpc.com/?api-key=..."]
RpcPool 실제:     api.mainnet-beta.solana.com, rpc.ankr.com/solana, solana.drpc.org (builtin만)
```

## 원인

`daemon-startup.ts` Step 4에서 RpcPool 초기화 시:
1. `config.toml` `[rpc]` 섹션의 URL → pool 등록 ✅
2. `BUILT_IN_RPC_DEFAULTS` → pool 등록 ✅
3. **Admin Settings DB `rpc_pool.*` → pool 등록 누락** ❌

Admin UI RPC 관리 화면은 `rpc_pool.*` 키를 사용하지만, 이 키를 pool에 시딩하는 코드가 없다.

## 수정 방향

Step 4에서 config.toml URLs 등록 후, built-in defaults 등록 전에 Admin Settings `rpc_pool.*` 키를 파싱하여 pool에 등록한다.

```typescript
// 2b. Seed Admin Settings rpc_pool.* URLs
if (state._settingsService) {
  const poolKeys = state._settingsService.listKeys().filter(k => k.startsWith('rpc_pool.'));
  for (const key of poolKeys) {
    const network = key.slice('rpc_pool.'.length);
    const raw = state._settingsService.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const validUrls = parsed.filter(u => typeof u === 'string' && u.length > 0);
        if (validUrls.length > 0) state.rpcPool.register(network, validUrls);
      }
    } catch {}
  }
}
```

우선순위: config.toml > Admin Settings rpc_pool > built-in defaults

## 테스트 항목

- [ ] Admin UI에서 Helius URL 등록 후 데몬 재시작 → Kamino/Drift가 Helius URL 사용
- [ ] config.toml + Admin Settings + built-in 3단계 우선순위 정상 동작
- [ ] Admin Settings에 빈 배열(`[]`) 등록 시 해당 네트워크 builtin만 사용 (에러 없음)
- [ ] defi-08 (Kamino) UAT dryRun PASS
- [ ] defi-10 (Drift) UAT dryRun PASS
