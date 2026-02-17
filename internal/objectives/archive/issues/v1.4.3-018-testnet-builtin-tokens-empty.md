# BUG-018: 테스트넷 빌트인 ERC-20 토큰이 빈 배열 — 토큰 전송 테스트 시 수동 등록 필요

## 심각도

**LOW** — 기능 영향 없으나, 테스트넷에서 토큰 전송을 테스트하려면 매번 커스텀 토큰 API로 수동 등록해야 하는 DX 문제.

## 증상

- `GET /v1/tokens?network=ethereum-sepolia` → 빈 배열 `[]`
- 5개 테스트넷 모두 동일: ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia
- 메인넷은 3~6개 빌트인 토큰이 등록되어 있으나, 테스트넷은 전무

## 원인

`packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts`에서 테스트넷 네트워크가 빈 배열로 하드코딩:

```typescript
'ethereum-sepolia': [],
'polygon-amoy': [],
'arbitrum-sepolia': [],
'optimism-sepolia': [],
'base-sepolia': [],
```

## 수정안

공식/검증된 테스트넷 토큰 주소를 빌트인에 추가한다. 출처별 분류:

- **Circle 공식**: USDC — 5개 네트워크 모두 배포, [Circle Faucet](https://faucet.circle.com/)에서 수령 가능
- **Chainlink 공식**: LINK (ERC677) — 5개 네트워크 모두 배포, [Chainlink Faucet](https://faucets.chain.link/)에서 수령 가능
- **Aave TestnetMintableERC20**: USDT, DAI, WBTC, AAVE, EURS, GHO, cbETH — [Aave Faucet](https://app.aave.com/) (testnet 모드)에서 수령 가능
- **Canonical**: WETH, WPOL — 각 체인의 표준 배포

### Ethereum Sepolia (10개)

| Symbol | Name | Decimals | Address | 출처 |
|--------|------|----------|---------|------|
| USDC | USD Coin | 6 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle 공식 |
| USDT | Tether USD | 6 | `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0` | Aave (169K holders) |
| WETH | Wrapped Ether | 18 | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` | Canonical (87K holders) |
| DAI | Dai Stablecoin | 18 | `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` | Aave (76K holders) |
| LINK | Chainlink | 18 | `0x779877A7B0D9E8603169DdbD7836e478b4624789` | Chainlink 공식 |
| WBTC | Wrapped Bitcoin | 8 | `0x29f2D40B0605204364af54EC677bD022dA425d03` | Aave |
| UNI | Uniswap | 18 | `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` | Deterministic (메인넷 동일) |
| AAVE | Aave Token | 18 | `0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a` | Aave |
| GHO | Gho Token | 18 | `0xc4bF5CbDaBE595361438F8c6a187bDc330539c60` | Aave |
| EURS | EURS Stablecoin | 2 | `0x6d906e526a4e2Ca02097BA9d0caA3c382F52278E` | Aave |

### Polygon Amoy (7개)

| Symbol | Name | Decimals | Address | 출처 |
|--------|------|----------|---------|------|
| USDC | USD Coin | 6 | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | Circle 공식 |
| USDT | Tether USD | 6 | `0x1fdE0eCc619726f4cD597887C9F3b4c8740e19e2` | Aave |
| WETH | Wrapped Ether | 18 | `0x52eF3d68BaB452a294342DC3e5f464d7f610f72E` | Polygonscan verified |
| DAI | Dai Stablecoin | 18 | `0xc8c0Cf9436F4862a8F60Ce680Ca5a9f0f99b5ded` | Aave |
| LINK | Chainlink | 18 | `0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904` | Chainlink 공식 |
| WPOL | Wrapped POL | 18 | `0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9` | Chainlink CCIP |
| AAVE | Aave Token | 18 | `0x1558c6FadDe1bEaf0f6628BDd1DFf3461185eA24` | Aave |

### Arbitrum Sepolia (4개)

| Symbol | Name | Decimals | Address | 출처 |
|--------|------|----------|---------|------|
| USDC | USD Coin | 6 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | Circle 공식 |
| WETH | Wrapped Ether | 18 | `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73` | Arbitrum canonical bridge |
| LINK | Chainlink | 18 | `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E` | Chainlink 공식 |

### Optimism Sepolia (3개)

| Symbol | Name | Decimals | Address | 출처 |
|--------|------|----------|---------|------|
| USDC | USD Coin | 6 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | Circle 공식 |
| WETH | Wrapped Ether | 18 | `0x4200000000000000000000000000000000000006` | OP Stack predeploy |
| LINK | Chainlink | 18 | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` | Chainlink 공식 |

### Base Sepolia (6개)

| Symbol | Name | Decimals | Address | 출처 |
|--------|------|----------|---------|------|
| USDC | USD Coin | 6 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Circle 공식 |
| USDT | Tether USD | 6 | `0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a` | Aave |
| WETH | Wrapped Ether | 18 | `0x4200000000000000000000000000000000000006` | OP Stack predeploy |
| WBTC | Wrapped Bitcoin | 8 | `0x54114591963CF60EF3aA63bEfD6eC263D98145a4` | Aave |
| LINK | Chainlink | 18 | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` | Chainlink 공식 |
| cbETH | Coinbase Wrapped Staked ETH | 18 | `0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B` | Aave |

### 총합: 메인넷 24개 + 테스트넷 30개 = 54개

| 네트워크 | 메인넷 | 테스트넷 |
|---------|--------|---------|
| Ethereum | 6 | 10 |
| Polygon | 5 | 7 |
| Arbitrum | 5 | 3 |
| Optimism | 5 | 3 |
| Base | 3 | 6 |
| **합계** | **24** | **30** (현재 0) |

### 테스트넷 토큰 Faucet 안내

| Faucet | URL | 토큰 |
|--------|-----|------|
| Circle | https://faucet.circle.com/ | USDC (5개 네트워크) |
| Chainlink | https://faucets.chain.link/ | LINK (5개 네트워크) + ETH |
| Aave | https://app.aave.com/ (testnet 모드 > Faucet 탭) | USDT, DAI, WBTC, AAVE, GHO, EURS, cbETH |

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts` — 빈 배열을 토큰 데이터로 교체 |
| API 영향 | `GET /v1/tokens?network=<testnet>` — 빈 배열 대신 빌트인 토큰 반환 |
| 기능 영향 | 없음 — 커스텀 토큰 등록은 그대로 동작 |
| 테스트 | 기존 토큰 레지스트리 테스트에 테스트넷 케이스 추가 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.3*
*상태: FIXED*
*관련: `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts`*

*해결: 2026-02-14*
*해결 방법: 5개 테스트넷 네트워크에 29개 빌트인 토큰 추가 (Circle USDC, Chainlink LINK, Aave 토큰, Canonical WETH/WPOL). 토큰 레지스트리 테스트 3개 추가.*
