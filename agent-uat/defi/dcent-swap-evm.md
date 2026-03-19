---
id: "defi-12"
title: "DCent Swap Aggregator"
category: "defi"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "swap", "dcent", "aggregator", "evm"]
---

# DCent Swap Aggregator

## Metadata
- **ID**: defi-12
- **Category**: defi
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 메인넷 토큰 스왑, 가스비 변동 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (스왑 금액 + 가스비, 최소 0.005 ETH)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: Ethereum Mainnet에서 ETH/토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: ETH 잔액이 0.005 이상인지 확인

### Step 2: DCent 스왑 Simulate
**Action**: DCent aggregator를 통해 ETH -> USDC 스왑을 dryRun으로 실행하여 최적 경로와 예상 수령량을 확인한다.
```bash
curl -s -X POST 'http://localhost:3100/v1/actions/dcent_swap/dex_swap?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "1000000000000000",
      "slippageBps": 50,
      "fromDecimals": 18,
      "toDecimals": 6
    }
  }'
```
**Expected**: 200 OK, DCent aggregator가 찾은 최적 경로, 예상 USDC 수령량, 가스비가 반환된다
**Check**: `outputAmount`(예상 USDC), `route`(최적 경로), `estimatedGas` 확인

### Step 3: 사용자 승인
**Action**: 스왑 경로, 예상 수령량, 가스비를 사용자에게 표시하고 승인을 요청한다.
- 스왑: 0.001 ETH -> {outputAmount} USDC
- 경로: {route} (DCent aggregator 최적 경로)
- 슬리피지 허용: 0.5% (50 bps)
- 예상 가스비: ~${gasCostUsd}

**Check**: 사용자가 스왑 조건을 확인하고 승인

### Step 4: 실제 스왑 실행
**Action**: 사용자 승인 후 실제 DCent 스왑을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/dcent_swap/dex_swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "1000000000000000",
      "slippageBps": 50,
      "fromDecimals": 18,
      "toDecimals": 6
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: 잔액 재확인
**Action**: 스왑 후 잔액을 재조회하여 ETH 감소, USDC 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: ETH 잔액이 0.001 ETH + 가스비만큼 감소, USDC 토큰 잔액이 증가
**Check**: ETH 감소분 확인, USDC 잔액이 simulate 예상치와 유사한지 확인

## Verification
- [ ] ETH 잔액 조회 성공 (200 응답)
- [ ] DCent 스왑 dryRun 성공 (최적 경로, 예상 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스왑 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스왑 후 ETH 감소, USDC 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| USDC approve (첫 스왑) | ethereum-mainnet | ~46,000 | ~$1-2 |
| DCent swap | ethereum-mainnet | ~200,000 | ~$3-5 |
| **Total** | | | **~$5.00** |

> **Note**: DCent aggregator는 여러 DEX의 유동성을 비교하여 최적 경로를 찾는다. 0x와 유사하지만 DCent 자체 라우팅 엔진을 사용한다. amount는 smallest unit(wei)으로 전달해야 한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| DCent API unavailable | DCent 서비스 장애 | 잠시 후 재시도, 서비스 상태 확인 |
| Route not found | 유동성 부족 또는 토큰 미지원 | 다른 토큰 쌍 또는 스왑 금액 조정 |
| Price impact warning | 스왑 금액 대비 유동성 부족 | 스왑 금액을 줄여 재시도 |
| Insufficient balance | ETH 잔액 부족 | 최소 0.005 ETH 확보 필요 |
| Slippage exceeded | 스왑 중 가격 변동 | `slippageBps`를 100 (1%)으로 증가 후 재시도 |
| DCent API returned empty txdata | 소액 라우팅 실패 | 스왑 금액을 0.002 ETH 이상으로 상향 |
| fromDecimals/toDecimals missing | 필수 파라미터 누락 | fromDecimals, toDecimals 추가 (#404) |
| fail_no_available_provider | amount를 human-readable로 전달 | amount는 반드시 smallest unit(wei)으로 전달 |
