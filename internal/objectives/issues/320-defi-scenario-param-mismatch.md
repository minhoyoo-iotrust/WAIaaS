# #320 — DeFi UAT 시나리오 문서 API 파라미터 불일치 (8건)

- **Type:** BUG
- **Severity:** MEDIUM
- **Status:** OPEN
- **Component:** `agent-uat/defi/`

## 증상

DeFi 시나리오 마크다운 파일의 API 호출 파라미터가 실제 Zod 스키마와 불일치하여 에이전트가 올바른 API 호출을 구성할 수 없음.

## 불일치 목록

| 시나리오 | 문서 파라미터 | 실제 스키마 | 비고 |
|----------|-------------|------------|------|
| defi-01 (Jupiter) | `amount: "0.005"` | `amount: "5000000"` | 최소 단위(lamports) 필요 |
| defi-02 (0x) | `sellToken: "ETH"` | `sellToken: "0xEeee..."` | 주소 형식 필요 |
| defi-03 (LI.FI) | `fromChain: "ethereum-mainnet"` | `fromChain: "ethereum"` | 네트워크 ID가 아닌 체인명 |
| defi-03 (LI.FI) | `amount: "0.005"` | `fromAmount: "500..."` (wei) | 필드명 + 최소 단위 |
| defi-04 (Across) | `token: "USDC"` | `inputToken`/`outputToken` (주소) | 필드명 + 주소 형식 |
| defi-04 (Across) | `fromChain: "arbitrum-mainnet"` | `fromChain: "arbitrum"` | 체인명 |
| defi-09 (Pendle) | `amount: "0.005"` | `amountIn: "500..."` (wei) | 필드명 + 최소 단위 |
| defi-12 (DCent) | `fromToken: "ETH"` | `fromAsset: "eip155:1/slip44:60"` (CAIP-19) | CAIP-19 형식 필요 |

## 공통 패턴

1. **amount 형식**: 시나리오는 사람이 읽기 쉬운 소수(`"0.005"`)를 사용하나, 실제 API는 최소 단위(lamports/wei) 문자열 필요
2. **체인 식별자**: 시나리오는 네트워크 ID(`ethereum-mainnet`)를 사용하나, 액션 API는 체인명(`ethereum`) 사용
3. **토큰 식별자**: 시나리오는 심볼(`ETH`, `USDC`)를 사용하나, 실제 API는 주소 또는 CAIP-19 형식 필요
4. **필드명 불일치**: `amount` vs `fromAmount`/`amountIn`/`sellAmount`, `token` vs `inputToken`/`fromAsset`

## 수정 방향

각 시나리오 마크다운의 ```` ```bash ```` 코드 블록을 실제 API 스키마에 맞게 수정. 사용자 가독성을 위해 코드 블록 위 **Action** 설명에는 사람이 읽기 쉬운 값을 유지하되, 실제 API 호출은 정확한 스키마 사용.

## 대상 파일

- `agent-uat/defi/jupiter-swap.md`
- `agent-uat/defi/0x-swap.md`
- `agent-uat/defi/lifi-bridge.md`
- `agent-uat/defi/across-bridge.md`
- `agent-uat/defi/pendle-yield.md`
- `agent-uat/defi/dcent-swap.md`

## 테스트 항목

- [ ] 수정된 시나리오의 API 호출이 ACTION_VALIDATION_FAILED 없이 성공
- [ ] 모든 파라미터가 실제 Zod 스키마와 일치
