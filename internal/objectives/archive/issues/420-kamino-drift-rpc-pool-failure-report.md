# #420 — Kamino/Drift SDK wrapper가 RPC 실패를 Pool에 보고하지 않아 URL 로테이션 불가

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-08 (Kamino), defi-10 (Drift)
- **컴포넌트**: `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts`, `packages/actions/src/providers/drift/drift-sdk-wrapper.ts`, `packages/actions/src/index.ts`

## 현상

Kamino/Drift SDK wrapper가 Solana RPC 429 에러 시 3회 재시도하지만, **매번 같은 RPC URL을 사용**하여 전부 실패한다. RpcPool에 3개 Solana mainnet 엔드포인트가 등록되어 있음에도 로테이션이 일어나지 않는다.

- `api.mainnet-beta.solana.com` (기본)
- `rpc.ankr.com/solana` (fallback 1)
- `solana.drpc.org` (fallback 2)

## 원인

`#419`에서 `resolveUrl()` 함수 패턴과 `solanaRpcResolver` 옵션을 추가했으나, **SDK wrapper가 429 실패 시 `rpcPool.reportFailure(network, url)`을 호출하지 않는다**. RpcPool은 `reportFailure()`가 호출되어야 해당 URL을 cooldown 상태로 전환하고 `getUrl()`이 다음 URL을 반환한다.

현재 흐름:
```
attempt 1: resolveUrl() → api.mainnet-beta.solana.com → 429 실패
           (reportFailure 미호출 → pool 상태 불변)
attempt 2: resolveUrl() → api.mainnet-beta.solana.com → 429 실패 (같은 URL)
attempt 3: resolveUrl() → api.mainnet-beta.solana.com → 429 실패 (같은 URL)
→ 3회 전부 동일 URL, 실패
```

기대 흐름:
```
attempt 1: resolveUrl() → api.mainnet-beta.solana.com → 429 실패
           reportFailure('solana-mainnet', url) → pool이 해당 URL 60초 cooldown
attempt 2: resolveUrl() → rpc.ankr.com/solana → 성공
           reportSuccess('solana-mainnet', url)
```

## 수정 방향

### 1. SDK Wrapper에 `onRpcFailure` 콜백 추가

KaminoSdkWrapper, DriftSdkWrapper 생성자에 `onRpcFailure?: (url: string) => void` 파라미터 추가. `loadMarket()` / `getClient()` 재시도 루프에서 429 또는 네트워크 에러 발생 시 현재 URL을 콜백으로 보고.

```typescript
// kamino-sdk-wrapper.ts loadMarket() 재시도 루프
for (let attempt = 0; attempt < maxRetries; attempt++) {
  const currentUrl = this.resolveUrl();
  try {
    const connection = new sdk.Connection(currentUrl, 'confirmed');
    // ...
  } catch (err) {
    this.onRpcFailure?.(currentUrl);  // ← Pool에 실패 보고
    // ...
  }
}
```

### 2. Factory에서 `reportFailure` 연결

`registerBuiltInProviders`의 `options`에 `reportSolanaRpcFailure?: (url: string) => void` 추가. daemon-startup.ts에서 `rpcPool.reportFailure('solana-mainnet', url)` 콜백 전달.

```typescript
// daemon-startup.ts
const reportSolanaFailure = (url: string) => rpcPool?.reportFailure('solana-mainnet', url);
const builtIn = registerBuiltInProviders(registry, settings, {
  solanaRpcResolver,
  reportSolanaRpcFailure: reportSolanaFailure,
});

// index.ts factory
new KaminoSdkWrapper(resolveRpcUrl, logger, options?.reportSolanaRpcFailure);
new DriftSdkWrapper(resolveDriftRpcUrl, config.subAccount, logger, options?.reportSolanaRpcFailure);
```

### 3. UAT 재검증

수정 후 defi-08, defi-10 시나리오를 UAT로 실행하여 RPC 로테이션이 동작하고 3개 엔드포인트 중 하나라도 응답하면 성공하는지 확인한다.

## 테스트 항목

### 단위 테스트
- [ ] KaminoSdkWrapper: 첫 번째 URL 429 시 `onRpcFailure` 콜백 호출 확인
- [ ] DriftSdkWrapper: 첫 번째 URL 429 시 `onRpcFailure` 콜백 호출 확인
- [ ] `onRpcFailure` 미제공 시 기존 동작과 동일 (하위 호환)
- [ ] 두 번째 URL 성공 시 정상 반환

### UAT 검증
- [ ] defi-08: Kamino USDC Supply dryRun 정상 완료 (RPC Pool 3개 엔드포인트 로테이션)
- [ ] defi-10: Drift add_margin dryRun 정상 완료 (RPC Pool 3개 엔드포인트 로테이션)
