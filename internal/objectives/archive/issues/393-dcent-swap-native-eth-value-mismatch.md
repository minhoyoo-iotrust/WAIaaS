# 393 — DCent Swap 네이티브 ETH 스왑 시 txdata.value 불일치로 온체인 revert

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

`POST /v1/actions/dcent_swap/dex_swap` (또는 `?dryRun=true`)으로 네이티브 ETH → USDC 스왑 실행 시 DCent 라우터 컨트랙트(`0xAC4c6e212A361c968F1725b4d055b47E63F80b75`)에서 `execution reverted` 발생.

dryRun 결과:
- `success: true` (정책 통과, DCent API에서 txdata 수신 성공)
- `simulation.success: false` (온체인 estimateGas에서 revert)

## 원인

DCent API `get_dex_swap_transaction_data` 응답의 `txdata.value` 값이 스왑 금액과 일치하지 않는다.

### 실제 API 응답 (0.005 ETH 스왑 요청 시)

| 필드 | 기대값 | 실제값 |
|------|--------|--------|
| `txdata.value` | `5000000000000000` (0.005 ETH) | `10925036` (~0.00000001 ETH) |

- 스왑 금액(`5000000000000000` wei = 0.005 ETH)은 calldata에 정상 인코딩됨
- 그러나 `txdata.value`(= EVM 트랜잭션의 `msg.value`)는 ~10,925,036 wei (프로토콜 수수료/팁으로 추정)
- DEX 라우터는 `msg.value`로 실제 ETH를 수령하므로, 스왑 금액만큼의 ETH가 전달되지 않아 revert

### 코드 경로

`packages/actions/src/providers/dcent-swap/dex-swap.ts` (line 264):

```typescript
value: txdata.value ? BigInt(txdata.value).toString() : '0',
```

- DCent API가 반환한 `txdata.value`를 그대로 사용
- 네이티브 ETH 매도(isNativeSell)인 경우에도 별도 value 보정 없음

### 유닛 테스트와의 불일치

`dcent-dex-swap.test.ts` (line 80) mock fixture:

```typescript
value: '1000000000000000000',  // 1 ETH = 스왑 금액과 동일
```

테스트는 DCent API가 스왑 금액을 `txdata.value`에 포함하여 반환한다고 가정하나, 실제 API는 프로토콜 수수료만 반환한다.

## 영향

- **모든 네이티브 자산 매도 스왑**이 온체인에서 revert (ETH→USDC, ETH→USDT 등)
- ERC-20 매도 스왑(USDC→ETH 등)은 `value: '0'`이므로 영향 없음
- dryRun과 실제 실행 모두 동일하게 실패

## 수정 방안

### A. 네이티브 매도 시 value 보정 (권장)

`dex-swap.ts`에서 `isNativeSell`일 때, `txdata.value`가 `params.amount`보다 작으면 `params.amount`를 value로 사용하거나 합산:

```typescript
// 수정안
let swapValue = txdata.value ? BigInt(txdata.value).toString() : '0';
if (isNativeSell) {
  const apiValue = BigInt(swapValue);
  const swapAmount = BigInt(params.amount);
  if (apiValue < swapAmount) {
    // DCent API가 프로토콜 수수료만 반환 → 스왑 금액으로 대체
    // 또는 swapAmount + apiValue (수수료 포함)
    swapValue = swapAmount.toString();
  }
}
```

### B. DCent API 문의

DCent 측에 `txdata.value` 반환 규격 확인. 네이티브 자산 스왑 시 value에 스왑 금액을 포함해야 하는지, 프로토콜 수수료만 반환하는 것이 의도인지 확인.

### C. 테스트 fixture 현실화

mock fixture의 `value`를 실제 API 응답 패턴(프로토콜 수수료 값)으로 수정하고, 보정 로직을 테스트.

## 수정 대상 파일

- `packages/actions/src/providers/dcent-swap/dex-swap.ts` — value 보정 로직 추가 (line 259-265)
- `packages/actions/src/__tests__/dcent-dex-swap.test.ts` — native sell value 보정 테스트 추가

## 테스트 항목

1. **유닛 테스트**: 네이티브 ETH 매도 시 `txdata.value < params.amount`이면 value가 `params.amount`로 보정되는지 검증
2. **유닛 테스트**: 네이티브 ETH 매도 시 `txdata.value >= params.amount`이면 API 값 그대로 사용되는지 검증
3. **유닛 테스트**: ERC-20 매도 시 value 보정 로직이 적용되지 않는지 검증 (기존 동작 유지)
4. **통합 테스트**: 실제 DCent API로 ETH→USDC dryRun 시 simulation.success: true 확인
