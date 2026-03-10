# #310 — Sepolia ERC-20 토큰이 assets API에 미표시 — incoming TX에는 수신 기록 존재

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** WONTFIX
- **마일스톤:** —
- **종료일:** 2026-03-10
- **종료 사유:** 원인 A 확인 — 정상 동작. 온체인 잔액 0인 토큰은 `balance > 0n` 필터에 의해 의도적으로 제외됨. incoming TX는 과거 수신 이력이므로 현재 잔액과 무관.

## 현상

`GET /v1/wallet/assets?network=ethereum-sepolia` 호출 시 native ETH만 반환되고, Sepolia USDC 토큰이 표시되지 않는다. 그런데 `GET /v1/wallet/incoming` API에는 동일 지갑으로 Sepolia USDC 20개 수신 기록이 CONFIRMED 상태로 존재한다.

### 재현 데이터

```
# assets API — USDC 미표시
GET /v1/wallet/assets?network=ethereum-sepolia&walletId=019c6fb6-2b2d-72a8-8515-235255be884d
→ assets: [{ mint: "native", symbol: "ETH", balance: "154946925508487680" }]

# incoming TX — USDC 20개 수신 기록 존재
GET /v1/wallet/incoming?network=ethereum-sepolia&walletId=019c6fb6-2b2d-72a8-8515-235255be884d
→ { txHash: "0x71ef0f...", amount: "20000000", tokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", status: "CONFIRMED" }
```

## 원인 분석

### 코드 경로

1. **`wireEvmTokens()`** (`wallet.ts:133-180`): 빌트인 토큰 레지스트리 + ALLOWED_TOKENS 정책에서 토큰 목록을 수집하여 adapter에 `setAllowedTokens()` 호출
2. **`adapter.getAssets()`** (`adapter.ts:169-236`): `_allowedTokens` 목록에 대해 multicall `balanceOf()` 조회, **`balance > 0n`인 토큰만 반환**
3. **빌트인 토큰 레지스트리** (`builtin-tokens.ts`): Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) **정상 등록됨**

### 원인 후보

| 후보 | 가능성 | 설명 |
|------|--------|------|
| A. 실제 온체인 잔액 0 | 높음 | 수신 후 이미 소비/전송하여 잔액 0 → `balance > 0n` 필터에 의해 미표시. incoming TX는 과거 기록이므로 현재 잔액과 무관 |
| B. tokenRegistryService 미주입 | 낮음 | wireEvmTokens()에서 `if (deps.tokenRegistryService)` 가드 → 미주입 시 빌트인 토큰 로드 건너뜀, `_allowedTokens`가 빈 배열이면 ERC-20 조회 자체를 시도하지 않음 |
| C. multicall RPC 실패 | 낮음 | balanceOf multicall이 silent failure하면 해당 토큰 건너뜀 |

### 관련 이슈

- #014 (FIXED, 2026-02-13): "EVM getAssets()가 ERC-20 토큰 잔액 미반환 — ALLOWED_TOKENS 정책 미연동" — wireEvmTokens() 도입으로 수정됨

## 확인 필요 사항

1. 해당 지갑의 **현재 Sepolia USDC 온체인 잔액** 직접 확인 (etherscan 또는 RPC `balanceOf` 호출)
2. `tokenRegistryService`가 wallet route 생성 시 정상 주입되는지 런타임 확인
3. 원인 A 확인 시: assets API의 `balance > 0n` 필터가 의도된 동작인지 (0 잔액 토큰도 표시해야 하는지 UX 결정 필요)
4. 원인 B 확인 시: DI 체인에서 tokenRegistryService 주입 누락 지점 수정

## 수정 방안

- **원인 A (잔액 0)인 경우**: 정상 동작이므로 WONTFIX. 단, testnet-04 시나리오 Prerequisites에 "USDC 잔액 보유 확인" 조건 명확화
- **원인 B (주입 누락)인 경우**: daemon.ts → createApp() → wallet route 의존성 주입 경로 수정
- **원인 C (RPC 실패)인 경우**: multicall 실패 시 fallback 개별 조회 또는 로그 추가

## 테스트 항목

- [ ] Sepolia USDC 잔액 보유 상태에서 `GET /v1/wallet/assets` 호출 시 USDC 표시 확인
- [ ] tokenRegistryService 정상 주입 확인 (로그 또는 단위 테스트)
- [ ] multicall 실패 시 에러 핸들링 동작 확인
