---
id: "defi-14"
title: "DCent 2-hop Auto-Routing (DAI→LINK)"
category: "defi"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "swap", "dcent", "aggregator", "evm", "2hop", "routing"]
---

# DCent 2-hop Auto-Routing (DAI→LINK)

## Metadata
- **ID**: defi-14
- **Category**: defi
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 메인넷 토큰 스왑, 가스비 변동 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] DAI 보유 (최소 10 DAI) 또는 ETH 보유 (가스비)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: Ethereum Mainnet에서 DAI/토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 목록이 반환된다
**Check**: DAI 잔액 또는 ETH 잔액 확인

### Step 2: 2-hop 경로 탐색 (dryRun)
**Action**: 직접 경로가 없는 토큰 쌍(DAI→LINK)에 대해 2-hop 견적을 조회한다.
```bash
curl -s -X POST 'http://localhost:3100/v1/actions/dcent_swap/dex_swap?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "toAsset": "eip155:1/erc20:0x514910771AF9Ca656af840dff83E8264EcF986CA",
      "amount": "10000000000000000000",
      "slippageBps": 100,
      "fromDecimals": 18,
      "toDecimals": 18
    }
  }'
```
**Expected**: 200 OK, 2-hop 경로(DAI→ETH→LINK 등)가 반환된다
**Check**: `route`에 중간 토큰이 포함되는지 확인. 직접 경로가 있으면 직접 경로가 우선 선택될 수 있음

### Step 3: 견적 비교 (get_quotes)
**Action**: 복수 프로바이더 견적을 직접 조회한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/dcent_swap/get_quotes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "1000000000000000",
      "fromDecimals": 18,
      "toDecimals": 6
    }
  }'
```
**Expected**: 200 OK, 복수 프로바이더(1inch, Sushi, Uniswap, Rubic, ButterSwap 등) 견적이 반환된다
**Check**: 각 프로바이더의 `outputAmount`, `status` 확인. bestOrder가 최적 경로로 정렬

## Verification
- [ ] 잔액 조회 성공 (200 응답)
- [ ] 2-hop 경로 탐색 시 중간 토큰 경유 경로가 표시됨
- [ ] 복수 프로바이더 견적이 반환되고 bestOrder로 정렬됨

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 2-hop swap (approve + swap x2) | ethereum-mainnet | ~400,000 | ~$5.00 |
| **Total** | | | **~$5.00** |

> **Note**: 2-hop 라우팅은 직접 유동성이 부족한 토큰 쌍에서 중간 토큰(ETH/USDC/USDT)을 경유하여 스왑한다. DAI 미보유 시 dryRun까지만 검증 가능.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| No 2-hop route | 중간 토큰 경유 경로 없음 | 유동성이 높은 토큰 쌍으로 변경 |
| Route not found | 유동성 부족 또는 토큰 미지원 | 다른 토큰 쌍 또는 스왑 금액 조정 |
| Insufficient balance | 토큰 잔액 부족 | DAI 또는 ETH 확보 필요 |
| fromDecimals/toDecimals missing | 필수 파라미터 누락 | fromDecimals, toDecimals 추가 (#404) |
| fail_no_available_provider | amount를 human-readable로 전달 | amount는 반드시 smallest unit(wei)으로 전달 |
