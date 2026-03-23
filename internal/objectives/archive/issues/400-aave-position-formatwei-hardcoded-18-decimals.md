# 400 — Aave V3 포지션 amount/USD가 18 decimals 하드코딩으로 USDC 등 비-18 토큰 표시 오류

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **마일스톤:** —
- **발견일:** 2026-03-19

## 현상

DeFi Positions 대시보드에서 Aave V3 USDC supply 포지션이 다음과 같이 잘못 표시:

| 필드 | 기대값 | 실제값 |
|------|--------|--------|
| AMOUNT | `1.0` (또는 `0.999999`) | `0.00000000000999999` |
| USD VALUE | `~$1.00` | `$0.00` |
| HEALTH FACTOR | `∞` 또는 매우 큰 수 | `1.15792089237316e+59` |
| TOTAL DEFI VALUE | `~$1.00` | `$0.00` |

## 원인

`packages/actions/src/providers/aave-v3/index.ts` (line 514-525):

### formatWei (line 514-521)

```typescript
const formatWei = (val: bigint): string => {
  const str = val.toString();
  if (str.length <= 18) return '0.' + str.padStart(18, '0');
  const whole = str.slice(0, str.length - 18);
  const frac = str.slice(str.length - 18);
  ...
};
```

**18 decimals가 하드코딩**되어 있음. USDC(6 decimals)의 aToken balance `999999`를 18 decimals로 포맷:
- `"999999".padStart(18, '0')` → `"0.000000000000999999"` (10^-12)

### calcUsd (line 523-525)

```typescript
const calcUsd = (balance: bigint, price: bigint): number => {
  return Number((balance * price) / 10n ** 18n) / 1e8;
};
```

역시 `10n ** 18n`으로 나눔. USDC의 경우:
- `(999999 * 100000000) / 10^18 / 10^8 ≈ 10^-12` → `$0.00`

## 영향

- **USDC (6), USDT (6), WBTC (8)** 등 decimals ≠ 18인 모든 토큰의 Aave 포지션 amount/USD 표시 오류
- ETH, stETH (18 decimals)만 정상 표시
- DeFi 대시보드의 Total DeFi Value, Health Factor 통계가 부정확

## 수정 방안

각 reserve의 decimals를 읽어와서 동적으로 적용:

```typescript
// 각 reserve에서 decimals 조회 (reserveData에서 또는 ERC-20 decimals 호출)
const decimals = reserveData.decimals ?? 18; // 또는 별도 ERC-20 decimals 호출

const formatAmount = (val: bigint, dec: number): string => {
  const str = val.toString();
  if (str.length <= dec) return '0.' + str.padStart(dec, '0');
  const whole = str.slice(0, str.length - dec);
  const frac = str.slice(str.length - dec).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
};

const calcUsd = (balance: bigint, price: bigint, dec: number): number => {
  return Number((balance * price) / 10n ** BigInt(dec)) / 1e8;
};
```

## 수정 대상 파일

- `packages/actions/src/providers/aave-v3/index.ts` — `formatWei`/`calcUsd` 함수에 decimals 파라미터 추가

## 테스트 항목

1. **유닛 테스트**: USDC(6), WBTC(8), ETH(18) 각각의 amount 포맷 정확성 검증
2. **유닛 테스트**: calcUsd가 토큰 decimals에 맞게 USD 계산하는지 검증
3. **통합 테스트**: Aave USDC supply 후 DeFi Positions에 ~1.0 USDC, ~$1.00 표시 확인
