# #415 — Drift SDK 초기화 시 Solana RPC 429 에러 + 재시도 로직 부재

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-10
- **컴포넌트**: `packages/actions/src/providers/drift/drift-sdk-wrapper.ts`
- **관련**: defi-08 (Kamino도 동일 패턴)

## 현상

`POST /v1/actions/drift_perp/drift_add_margin?dryRun=true` 호출 시:
```
429 Too Many Requests: Too many requests for a specific RPC call
```
30초 간격 3회 재시도에도 동일 에러 반복. #408(Wallet.local) 수정 여부 검증 불가.

## 원인

`DriftSdkWrapper.getClient()`(line 365-378)에서 `client.subscribe()` 호출 시:

1. **Drift SDK `subscribe()`가 3-4회 RPC 호출** — program state, margin account, perp markets 일괄 로드
2. **공용 Solana RPC** (`api.mainnet-beta.solana.com`) 사용 — 100-150 req/min 제한
3. **재시도/backoff 로직 부재** — 429 에러 시 즉시 실패, 재시도 없음
4. **RPC Pool 미사용** — 코어의 `RpcPool`(endpoint 로테이션, cooldown) 미연동

Kamino SDK도 동일 패턴 — Solana DeFi 프로바이더 공통 문제.

```
Free RPC → strict rate limit → DriftClient.subscribe() 3-4 calls
  → no retry/backoff → no RPC pool rotation → 즉시 실패
```

## 수정 방향

1. **P0**: `DriftSdkWrapper`에 429 재시도 + 지수 backoff (3회, 1s/2s/4s)
2. **P0**: `KaminoSdkWrapper`도 동일 적용
3. **P1**: DeFi SDK wrapper에 RpcPool 연동 (endpoint 로테이션)
4. **P1**: Admin Settings에서 커스텀 Solana RPC 엔드포인트 설정 가능하도록

## 테스트 항목

- [ ] 429 응답 시 지수 backoff 재시도 동작 확인
- [ ] 3회 재시도 후에도 실패 시 명확한 에러 메시지 반환
- [ ] 커스텀 RPC URL 설정 시 해당 엔드포인트 사용 확인
- [ ] RPC Pool 연동 시 endpoint 로테이션 동작 확인
