# #415 — Drift SDK 초기화 시 Solana RPC 429 에러 + 재시도 로직 부재

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-10, (defi-08 Kamino도 동일 패턴)
- **컴포넌트**: `packages/actions/src/providers/drift/drift-sdk-wrapper.ts`
- **관련**: RpcPool (`packages/core/src/rpc/rpc-pool.ts`)
- **상태**: FIXED
- **수정일**: 2026-03-20
- **재현 확인**: 2026-03-19 v2.12.0-rc (3회 재시도 모두 429)

## 현상

`POST /v1/actions/drift_perp/drift_add_margin?dryRun=true` 호출 시:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: 429 Too Many Requests: Too many requests for a specific RPC call"
}
```

3초, 10초, 30초 간격으로 3회 재시도해도 동일 에러 반복. #408(Wallet.local) 수정 여부 검증 불가.

## 실행 경로

```
POST /v1/actions/drift_perp/drift_add_margin?dryRun=true
  → DriftPerpProvider.resolve('drift_add_margin', params, context)
    [packages/actions/src/providers/drift/index.ts]
  → DriftPerpProvider.resolveAddMargin(params, context)
    [index.ts:251-262]
  → DriftSdkWrapper.buildDepositInstruction(params)
    [drift-sdk-wrapper.ts:501-511]
  → DriftSdkWrapper.getClient()
    [drift-sdk-wrapper.ts:369-391]
    → new sdk.Connection(this.rpcUrl, 'confirmed')   [line 373] — 단일 URL
    → new sdk.DriftClient({connection, wallet, ...})  [line 374-379]
    → await client.subscribe()                        [line 381] ← RPC 429 HERE
    → catch: throw err                                [line 387] ← 즉시 전파, 재시도 없음
```

## 원인 분석

### 1. getClient()에 재시도/backoff 없음

**파일**: `drift-sdk-wrapper.ts:369-391`

```typescript
private async getClient(): Promise<any> {
  if (this._client) return this._client;       // 캐시된 클라이언트 재사용

  const sdk = await this.loadSdk();
  const connection = new sdk.Connection(this.rpcUrl, 'confirmed');  // 고정 URL
  const client = new sdk.DriftClient({
    connection,
    wallet: new sdk.Wallet(sdk.Keypair.generate()),
    programID: new sdk.PublicKey(DRIFT_PROGRAM_ID),
    activeSubAccountId: this.subAccount,
  });

  try {
    await client.subscribe();    // ← 단일 시도, 재시도 없음
  } catch (err) {
    this.logger?.error('DriftSdkWrapper.getClient: subscribe failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;                   // ← 즉시 전파
  }

  this._client = client;
  return client;
}
```

**문제점**:
- `subscribe()` 실패 시 **재시도 없음** — 즉시 throw
- `this._client`가 null로 남음 → 다음 호출 시 동일 경로 재실행 → 동일 429
- **backoff 없음** — 429 후 바로 재시도하면 여전히 rate limit

### 2. 단일 RPC URL 사용

**생성자**: `drift-sdk-wrapper.ts:326-330`
```typescript
constructor(rpcUrl: string, subAccount: number, logger?: ILogger) {
  this.rpcUrl = rpcUrl;       // 단일 문자열, 변경 불가
  this.subAccount = subAccount;
  this.logger = logger;
}
```

**팩토리**: `packages/actions/src/index.ts:308-318`
```typescript
factory: () => {
  const driftRpcUrl = settingsReader.get('rpc.solana_mainnet') || '';
  const config: DriftConfig = {
    enabled: true,
    subAccount: 0,
    rpcUrl: driftRpcUrl,    // 단일 URL (Admin Settings에서 읽음)
  };
  return new DriftPerpProvider(config, new DriftSdkWrapper(driftRpcUrl, config.subAccount, logger));
},
```

**문제점**: `rpcUrl`이 빈 문자열이면 공용 RPC(`api.mainnet-beta.solana.com`) fallback → 엄격한 rate limit

### 3. subscribe()가 발생시키는 RPC 호출

Drift SDK `DriftClient.subscribe()` 내부:
- **getProgramAccounts** — Drift 프로그램 상태 로드
- **getAccountInfo** — margin account 조회
- **getPerpMarketAccounts** — 전체 Perp 마켓 데이터
- **getSpotMarketAccounts** — 전체 Spot 마켓 데이터
- 총 **3-4회 RPC 호출** 동시 발생

공용 Solana RPC 제한: ~100-150 req/min → 다른 Solana 작업과 합산 시 쉽게 초과

### 4. RpcPool 인프라 존재하지만 미사용

**파일**: `packages/core/src/rpc/rpc-pool.ts`

RpcPool의 주요 기능:
- **URL 로테이션**: `getUrl(network)` — 우선순위 기반, cooldown 중인 URL 건너뜀
- **지수 backoff**: `cooldown = min(baseCooldownMs * 2^(failureCount-1), maxCooldownMs)` — 기본 60s, 최대 300s
- **실패 보고**: `reportFailure(network, url)` — cooldown 시작
- **성공 보고**: `reportSuccess(network, url)` — 실패 카운트 리셋
- **빌트인 네트워크**: solana-mainnet 포함 13개 네트워크 기본 등록
- **이벤트**: `RPC_HEALTH_DEGRADED`, `RPC_ALL_FAILED`, `RPC_RECOVERED`

**현재 사용처**: 인프라(adapter-pool.ts), EVM RPC 프록시 — **DeFi 프로바이더는 미사용**

### 5. Kamino도 동일 패턴

`kamino-sdk-wrapper.ts:311-323`:
```typescript
private async loadMarket(...) {
  const connection = new sdk.Connection(this.rpcUrl, 'confirmed');  // 매번 새 Connection
  const market = await sdk.KaminoMarket.load(connection, marketPubkey);  // RPC 호출
  // 재시도 없음, RpcPool 미사용
}
```

## 수정 방향

### 1단계: getClient()에 재시도 + 지수 backoff 추가 (P0)

```typescript
private async getClient(): Promise<any> {
  if (this._client) return this._client;

  const sdk = await this.loadSdk();
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const url = this.rpcPool
        ? this.rpcPool.getUrl('solana-mainnet')
        : this.rpcUrl;
      const connection = new sdk.Connection(url, 'confirmed');
      const client = new sdk.DriftClient({
        connection,
        wallet: new sdk.Wallet(sdk.Keypair.generate()),
        programID: new sdk.PublicKey(DRIFT_PROGRAM_ID),
        activeSubAccountId: this.subAccount,
      });

      await client.subscribe();

      if (this.rpcPool) this.rpcPool.reportSuccess('solana-mainnet', url);
      this._client = client;
      return client;
    } catch (err) {
      lastError = err as Error;
      if (this.rpcPool) this.rpcPool.reportFailure('solana-mainnet', url);
      this.logger?.warn(`DriftSdkWrapper: subscribe attempt ${attempt + 1}/${maxRetries} failed`, {
        error: lastError.message,
      });
      const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }

  throw new ChainError('RPC_RATE_LIMITED', 'solana', {
    message: `Drift SDK initialization failed after ${maxRetries} retries: ${lastError?.message}`,
  });
}
```

### 2단계: DriftSdkWrapper에 RpcPool 주입 (P1)

```typescript
constructor(
  rpcUrlOrPool: string | RpcPool,
  subAccount: number,
  logger?: ILogger,
) {
  if (typeof rpcUrlOrPool === 'string') {
    this.rpcUrl = rpcUrlOrPool;
    this.rpcPool = null;
  } else {
    this.rpcPool = rpcUrlOrPool;
    this.rpcUrl = rpcUrlOrPool.getUrl('solana-mainnet');
  }
  this.subAccount = subAccount;
  this.logger = logger;
}
```

### 3단계: KaminoSdkWrapper에도 동일 패턴 적용 (P1)

Kamino의 `loadMarket()`에도 동일한 재시도 + RpcPool 로직 추가.

### 4단계: 팩토리에서 RpcPool 전달 (P1)

```typescript
// packages/actions/src/index.ts
factory: () => {
  const config = { enabled: true, subAccount: 0, rpcUrl: driftRpcUrl };
  return new DriftPerpProvider(
    config,
    new DriftSdkWrapper(rpcPool ?? driftRpcUrl, config.subAccount, logger)
  );
},
```

## 테스트 항목

- [ ] 429 응답 시 지수 backoff 재시도 동작 (1s → 2s → 4s)
- [ ] 3회 재시도 후에도 실패 시 `RPC_RATE_LIMITED` 에러 코드 반환
- [ ] RpcPool 연동 시 실패한 URL cooldown + 다른 URL 로테이션
- [ ] RpcPool 없이 단일 URL 모드에서도 재시도 동작 (하위 호환)
- [ ] 캐시된 _client 있을 때 RPC 호출 없이 즉시 반환
- [ ] 커스텀 Solana RPC URL 설정 시 해당 엔드포인트 사용
- [ ] Kamino에도 동일 재시도 로직 적용 확인
