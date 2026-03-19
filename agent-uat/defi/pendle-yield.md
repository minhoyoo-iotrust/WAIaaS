---
id: "defi-09"
title: "Pendle Yield Trading (PT)"
category: "defi"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "yield", "pendle", "evm", "pt", "yt"]
---

# Pendle Yield Trading (PT)

## Metadata
- **ID**: defi-09
- **Category**: defi
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 메인넷 Pendle PT 매매, 만기 리스크 관리 필요

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (가스비, 최소 0.01 ETH)
- [ ] stETH 또는 USDC 보유 (최소 0.01 stETH 또는 1 USDC -- PT 매수 원금)

## Scenario Steps

### Step 1: 토큰 잔액 조회
**Action**: Ethereum Mainnet에서 stETH 또는 USDC 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 목록에 stETH/USDC 잔액이 포함된다
**Check**: stETH >= 0.01 또는 USDC >= 1.0 확인

### Step 2: Pendle 마켓 목록 조회
**Action**: 활성 Pendle 마켓과 만기일을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=pendle&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 활성 Pendle 마켓 목록이 반환된다
**Check**: 만기일이 미래인 활성 마켓 선택. 만기된 마켓은 사용 불가

### Step 3: PT 매수 Simulate
**Action**: PT(Principal Token) 매수를 simulate으로 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/pendle_yield/buy_pt?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "market": "<MARKET_ADDRESS>",
      "tokenIn": "<stETH_ADDRESS>",
      "amountIn": "5000000000000000"
    }
  }'
```
**Expected**: 200 OK, 예상 PT 수령량, 내재 APY, 가스비가 반환된다
**Check**: `outputAmount`(예상 PT), `impliedApy`(내재 수익률), `estimatedGas` 확인

### Step 4: 사용자 승인
**Action**: PT 가격, 내재 APY, 만기일을 사용자에게 표시하고 승인을 요청한다.
- PT 매수: 0.005 stETH -> {outputAmount} PT
- 내재 APY: {impliedApy}%
- 만기일: {maturity}
- 만기 시 PT는 기초 자산(stETH)으로 1:1 교환 가능

**Check**: 사용자가 PT 매수 조건을 확인하고 승인

### Step 5: 실제 PT 매수 실행
**Action**: 사용자 승인 후 실제 PT 매수를 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/pendle_yield/buy_pt \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "market": "<MARKET_ADDRESS>",
      "tokenIn": "<stETH_ADDRESS>",
      "amountIn": "5000000000000000"
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 6: 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 7: PT 토큰 잔액 확인
**Action**: PT 매수 후 PT 토큰 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: PT 토큰 잔액이 증가, stETH 잔액이 감소
**Check**: PT 토큰 보유량이 simulate 예상치와 유사한지 확인

### Step 8: (선택) PT 매도 Simulate
**Action**: PT를 다시 기초 자산으로 매도하는 simulate을 확인한다. 실제 실행은 사용자 선택.
```bash
curl -s -X POST http://localhost:3100/v1/actions/pendle_yield/redeem_pt?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "market": "<MARKET_ADDRESS>",
      "tokenIn": "<stETH_ADDRESS>",
      "amountIn": "<PT_AMOUNT_IN_SMALLEST_UNITS>"
    }
  }'
```
**Expected**: 200 OK, 예상 stETH 반환량이 표시된다
**Check**: 실제 실행 여부는 사용자에게 확인. 만기 전 매도 시 소량 손실 가능

## Verification
- [ ] 토큰 잔액 조회 성공 (200 응답)
- [ ] Pendle 마켓 목록 확인 (활성 마켓 존재)
- [ ] PT 매수 simulate 성공 (예상 PT 수령량, 내재 APY 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 PT 매수 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] PT 토큰 잔액 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Token approve (첫 거래) | ethereum-mainnet | ~46,000 | ~$1-2 |
| Pendle swap (PT 매수) | ethereum-mainnet | ~300,000 | ~$3-5 |
| **Total** | | | **~$5.00** |

> **Note**: 0.005 stETH가 PT 토큰으로 변환된다. PT는 만기 시 기초 자산과 1:1 교환 가능하며, 만기 전 매매도 가능하다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Market expired | 선택한 마켓이 만기됨 | 만기일이 미래인 다른 마켓 선택 |
| Insufficient liquidity | 마켓 유동성 부족 | 매수 금액을 줄이거나 다른 마켓 선택 |
| Slippage exceeded | 스왑 중 가격 변동 | 슬리피지 허용치 증가 후 재시도 |
| Token approve needed | 첫 거래 시 토큰 승인 필요 | stETH/USDC approve 트랜잭션 먼저 실행 |
| PT/YT address unknown | 토큰 주소 불명 | Pendle 마켓 정보에서 PT/YT 주소 확인 |
