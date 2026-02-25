# #187 — 솔라나 메인넷 잔액 조회 429 실패 — 무료 RPC rate limit + 재시도 로직 부재

- **유형:** BUG
- **심각도:** HIGH
- **컴포넌트:** `packages/adapters/solana/src/adapter.ts`, `packages/daemon/src/routes/admin.ts`

## 현상

Admin UI 지갑 상세 페이지에서 솔라나 메인넷 잔액 조회 시 에러:

```
Failed to get assets: HTTP error (429): Too Many Requests
```

Refresh 버튼을 눌러도 동일 에러 반복. 솔라나 메인넷 지갑의 잔액 및 토큰 보유 현황 확인 불가.

## 근본 원인

### 1. 무료 공용 RPC 엔드포인트의 엄격한 rate limit

기본 솔라나 메인넷 RPC가 `https://api.mainnet-beta.solana.com` (무료 공용)으로 설정되어 있으며, 이 엔드포인트는 IP당 요청 수를 엄격히 제한.

```typescript
// config.loader.ts
rpc: {
  solana_mainnet: z.string().default('https://api.mainnet-beta.solana.com'),
}
```

### 2. getAssets() 호출 시 RPC 3회 요청

`SolanaAdapter.getAssets()` (adapter.ts 라인 166~256)가 단일 호출에 3개의 순차 RPC 요청 발생:

| # | RPC 메서드 | 용도 |
|---|-----------|------|
| 1 | `getBalance` | 네이티브 SOL 잔액 |
| 2 | `getTokenAccountsByOwner` (SPL Token) | SPL 토큰 보유량 |
| 3 | `getTokenAccountsByOwner` (Token-2022) | Token Extensions 보유량 |

### 3. Admin 잔액 API가 getBalance + getAssets 모두 호출

`GET /admin/wallets/:id/balance` (admin.ts)에서 네트워크별로:
- `adapter.getBalance()` — RPC 1회
- `adapter.getAssets()` — RPC 3회
- **합계: 네트워크당 4회 RPC 요청**

### 4. SolanaAdapter에 재시도 로직 없음

```typescript
// adapter.ts — getBalance 예시
async getBalance(address: string): Promise<bigint> {
  const result = await this.rpc.getBalance(address(addr)).send();
  return result.value;  // 429 시 즉시 예외, 재시도 없음
}
```

- EVM 어댑터의 IncomingSubscriber에는 per-wallet backoff가 있으나, SolanaAdapter의 getAssets/getBalance에는 **재시도/backoff 로직이 전혀 없음**
- SDK 클라이언트에는 429 재시도가 구현되어 있으나, 데몬 내부 호출에는 적용되지 않음

### 5. 백그라운드 폴링과 rate limit 경합

IncomingTxMonitor의 SolanaIncomingSubscriber가 백그라운드에서 주기적으로 RPC 호출을 수행하여, Admin UI 잔액 조회와 rate limit 버짓을 경합.

## 영향

- **Admin UI**: 솔라나 메인넷 지갑 잔액/토큰 보유 현황 조회 불가
- **REST API**: `GET /v1/wallet/assets?network=mainnet`도 동일 실패 가능
- **MCP**: `get_assets` 도구도 동일 경로 사용 시 실패 가능
- **지갑 목록**: Admin 지갑 목록에서 최대 10개 지갑 잔액을 병렬 조회 시 더 심화 (10 × 4 = 40 RPC 동시 요청)

## 수정 제안

### P0 — 즉시 대응
1. **SolanaAdapter에 429 재시도 로직 추가**: exponential backoff (1s/2s/4s, 최대 3회) + jitter. SDK 클라이언트에 이미 구현된 패턴 재활용.

### P1 — 단기 개선
2. **getAssets() RPC 호출 최소화**: `getBalance()` 결과를 `getAssets()` 내부에서 재사용하여 중복 호출 제거 (4회 → 3회).
3. **잔액 캐싱**: 짧은 TTL(5~10초) 메모리 캐시 도입으로 연속 조회 시 RPC 절약.
4. **Admin 잔액 병렬 조회 제한**: 지갑 목록 잔액 조회 시 동시 요청 수 제한 (concurrency limiter).

### P2 — 중기 개선
5. **유료 RPC 안내**: Admin Settings에서 솔라나 RPC URL 미변경 시 경고 배너 표시 ("무료 공용 엔드포인트는 rate limit이 엄격합니다. 전용 RPC 사용을 권장합니다.")
6. **RPC 상태 모니터링**: #185와 연계하여 네트워크별 RPC 상태(성공률, 연속 실패) Admin UI 표시.

## 테스트 항목

1. **단위 테스트**: SolanaAdapter RPC 호출 429 응답 시 지수 backoff 재시도 동작 검증
2. **단위 테스트**: 재시도 최대 횟수 초과 시 적절한 에러 전파 검증
3. **통합 테스트**: Admin 잔액 API가 일시적 429 후 재시도 성공 시나리오 검증
4. **단위 테스트**: 잔액 캐싱 도입 시 TTL 내 중복 RPC 호출 미발생 검증
