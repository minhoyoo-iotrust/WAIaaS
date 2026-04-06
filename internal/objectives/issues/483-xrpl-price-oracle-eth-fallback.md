# 483 — XRPL Price Oracle가 ETH 가격을 반환하는 버그

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-07
- **발견 경위:** XRPL DEX 스왑 UAT 중 1 XRP 스왑이 $2164.20로 표시되어 DELAY tier 정책에 걸림

## 증상

- XRPL DEX 스왑 시 `amount_usd`가 ETH 가격으로 계산됨 (1 XRP → $2164.20, 실제 XRP = $1.35)
- SPENDING_LIMIT 정책이 ETH 가격 기준으로 적용되어 소액 XRP 트랜잭션도 DELAY tier에 걸림
- 모든 XRPL 트랜잭션의 USD 금액 표시가 ~1600배 과대 평가

## 원인

3곳에서 `ripple` 체인이 누락되어 `ethereum` fallback으로 빠짐:

### 1. `packages/daemon/src/infrastructure/oracle/price-cache.ts:38-41`
```ts
export function resolveNetwork(chain, network?) {
  if (network) return network;
  return chain === 'solana' ? 'solana-mainnet' : 'ethereum-mainnet';
  // ripple → 'ethereum-mainnet' (잘못됨, 'xrpl-mainnet'이어야 함)
}
```

### 2. `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts`
- `COINGECKO_PLATFORM_MAP`에 `'xrpl-mainnet'` 항목 없음
- 추가 필요: `{ platformId: 'xrpl', nativeCoinId: 'ripple' }`

### 3. `packages/daemon/src/infrastructure/oracle/oracle-chain.ts:140`
```ts
const decimals = chain === 'solana' ? 9 : 18;
// ripple은 decimals=6인데 18로 처리됨
```
- 동일 패턴: `packages/daemon/src/infrastructure/oracle/pyth-oracle.ts:169`

### 4. `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts`
- `NATIVE_FEED_MAP`에 XRPL 항목 없음 (Pyth에 XRP/USD feed 존재하면 추가)

## 영향

- **정책 평가 오류**: SPENDING_LIMIT이 ETH 가격 기준으로 판단 → 소액 XRP도 DELAY/DENY
- **금액 표시 오류**: Admin UI/API에서 XRPL 트랜잭션 USD 표시 ~1600배 과대
- **누적 지출 한도**: ETH 가격 기준 누적 → 한도 조기 소진

## 수정 계획

| 파일 | 변경 |
|------|------|
| `price-cache.ts` | `resolveNetwork`에 `chain === 'ripple' ? 'xrpl-mainnet'` 분기 추가 |
| `coingecko-platform-ids.ts` | `'xrpl-mainnet': { platformId: 'xrpl', nativeCoinId: 'ripple' }` 추가 |
| `oracle-chain.ts:140` | `nativeDecimals(chain)` import 사용 (하드코딩 제거) |
| `pyth-oracle.ts:169` | 동일하게 `nativeDecimals(chain)` 사용 |
| `pyth-feed-ids.ts` | XRP/USD Pyth feed ID 추가 (존재 시) |

## 테스트 항목

- [ ] `resolveNetwork('ripple')` → `'xrpl-mainnet'` 반환 확인
- [ ] `getNativePrice('ripple')` → XRP 가격 반환 (ETH 아님)
- [ ] XRPL 트랜잭션 USD 표시가 실제 XRP 가격 기준인지 확인
- [ ] SPENDING_LIMIT 정책이 XRP 가격 기준으로 정상 동작 확인
- [ ] 기존 EVM/Solana oracle 동작 회귀 테스트
