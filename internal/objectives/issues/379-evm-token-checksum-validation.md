# 379 — EVM 토큰 주소 EIP-55 체크섬 검증 누락으로 multicall 전체 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **발견일:** 2026-03-17
- **발견 경로:** Agent UAT 중 데몬 로그에서 ERC-20 multicall 연쇄 실패 확인

---

## 증상

`GET /v1/wallet/assets` 호출 시 ERC-20 잔액 조회가 모든 토큰에 대해 실패한다.

```
[EvmAdapter] ERC-20 multicall failed, falling back to individual call {
  token: '0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B',
  symbol: 'cbETH',
  error: 'Address "0xFc3e86566895FB007c6A0D3809eB2827dF94f751" is invalid.
    - Address must match its checksum counterpart.'
}
```

- PIM 토큰 주소 `0xFc3e86566895FB007c6A0D3809eB2827dF94f751`의 EIP-55 체크섬이 잘못됨
- 올바른 체크섬: `0xFC3e86566895Fb007c6A0d3809eb2827DF94F751`
- PIM 하나의 잘못된 체크섬이 **같은 배치의 전체 토큰**(cbETH, LINK, USDC, USDT, WBTC, WETH 등)을 연쇄 실패시킴
- 영향 네트워크: ethereum-sepolia, arbitrum-sepolia, base-sepolia (PIM이 등록된 3개 네트워크 전체)

## 근본 원인

토큰 주소가 등록부터 사용까지 **체크섬 검증/정규화 없이** 그대로 전달된다.

**문제 경로:**
1. `builtin-tokens.ts` — PIM 주소가 잘못된 체크섬으로 하드코딩
2. `TokenRegistryService.getAdapterTokenList()` — 주소를 검증 없이 반환
3. `EvmAdapter.setAllowedTokens()` — 주소를 검증 없이 저장
4. `EvmAdapter.getAssets()` — `token.address as \`0x${string}\`` 타입 캐스팅만 수행, viem `multicall()`이 EIP-55 엄격 검증 → 배치 전체 실패

## 해결 방안

### 1단계: 즉시 수정 — builtin-tokens.ts PIM 주소 교정

`builtin-tokens.ts`에서 PIM 토큰 주소 3곳을 올바른 체크섬으로 교정한다.

| 위치 | 네트워크 | 라인 |
|------|---------|------|
| L104 | ethereum-sepolia | `0xFc3e...` → `0xFC3e...` |
| L127 | arbitrum-sepolia | `0xFc3e...` → `0xFC3e...` |
| L149 | base-sepolia | `0xFc3e...` → `0xFC3e...` |

### 2단계: 방어적 수정 — setAllowedTokens()에서 체크섬 정규화

`EvmAdapter.setAllowedTokens()`에서 viem의 `getAddress()`로 모든 토큰 주소를 정규화한다. 이렇게 하면 커스텀 토큰 등록(`POST /v1/tokens`)이나 향후 builtin 데이터 오류도 자동으로 방어된다.

```typescript
import { getAddress } from 'viem';

setAllowedTokens(tokens: Array<{ address: string; symbol?: string; name?: string; decimals?: number }>): void {
  this._allowedTokens = tokens.map(t => ({
    ...t,
    address: getAddress(t.address),  // EIP-55 정규화
  }));
}
```

잘못된 주소가 들어오면 `getAddress()`가 `InvalidAddressError`를 throw하므로, 잘못된 주소가 조용히 통과하는 것도 방지된다.

### 관련 파일

| 파일 | 역할 | 수정 필요 |
|------|------|----------|
| `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts` | 빌트인 토큰 데이터 | 1단계 |
| `packages/adapters/evm/src/adapter.ts` | EVM 어댑터 (setAllowedTokens, getAssets) | 2단계 |

---

## 테스트 항목

- [ ] PIM 포함 네트워크(ethereum-sepolia, base-sepolia, arbitrum-sepolia)에서 `getAssets()` multicall 성공 확인
- [ ] multicall 결과에 ERC-20 토큰 잔액이 정상 반환되는지 확인
- [ ] `setAllowedTokens()`에 잘못된 체크섬 주소 전달 시 정규화되는지 단위 테스트
- [ ] `setAllowedTokens()`에 유효하지 않은 주소(길이 오류 등) 전달 시 예외 발생 확인
- [ ] 기존 테스트 회귀 없음 확인
