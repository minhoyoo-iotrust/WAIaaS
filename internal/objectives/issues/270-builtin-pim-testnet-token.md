# #270 — 빌트인 토큰 레지스트리에 PIM (Pimlico Test Token) 테스트넷 토큰 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **수정일:** 2026-03-07
- **마일스톤:** —

## 설명

Pimlico Test Token (PIM)을 EVM 테스트넷 빌트인 토큰 레지스트리에 추가한다.
Smart Account (ERC-4337) 테스트 시 페이마스터 연동 및 토큰 전송 검증에 사용되는 토큰으로,
3개 테스트넷에 동일 주소로 배포되어 있다.

## 토큰 정보

| 항목 | 값 |
|------|-----|
| Name | Pimlico Test Token |
| Symbol | PIM |
| Decimals | 6 |
| Address (EIP-55) | `0xFc3e86566895FB007c6A0D3809eB2827dF94f751` |

## 대상 네트워크

| 네트워크 | 배포 확인 | RPC 검증 |
|----------|----------|----------|
| `ethereum-sepolia` | O | `symbol()` = PIM, `decimals()` = 6 |
| `base-sepolia` | O | `symbol()` = PIM, `decimals()` = 6 |
| `arbitrum-sepolia` | O | `symbol()` = PIM, `decimals()` = 6 |

3개 네트워크 모두 동일 컨트랙트 주소 (CREATE2 배포 추정).

## 수정 대상

- `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts`
  - `ethereum-sepolia` 배열에 PIM 엔트리 추가
  - `base-sepolia` 배열에 PIM 엔트리 추가
  - `arbitrum-sepolia` 배열에 PIM 엔트리 추가

## 수정 내용

각 테스트넷 배열에 아래 엔트리를 추가:

```ts
{ address: '0xFc3e86566895FB007c6A0D3809eB2827dF94f751', symbol: 'PIM', name: 'Pimlico Test Token', decimals: 6 },
```

## 테스트 항목

- [ ] `builtin-tokens.ts`에서 `ethereum-sepolia`, `base-sepolia`, `arbitrum-sepolia` 각각 PIM 엔트리 포함 확인
- [ ] `getBuiltinTokens('ethereum-sepolia')` 결과에 PIM 포함
- [ ] `getBuiltinTokens('base-sepolia')` 결과에 PIM 포함
- [ ] `getBuiltinTokens('arbitrum-sepolia')` 결과에 PIM 포함
- [ ] 기존 토큰 레지스트리 테스트 통과 확인
