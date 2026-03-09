---
id: "defi-02"
title: "0x EVM DEX Swap (ETH -> USDC)"
category: "defi"
network: ["ethereum-mainnet", "polygon-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "swap", "0x", "evm", "dex"]
---

# 0x EVM DEX Swap (ETH -> USDC)

## Metadata
- **ID**: defi-02
- **Category**: defi
- **Network**: ethereum-mainnet, polygon-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00 (Ethereum), ~$0.05 (Polygon)
- **Risk Level**: medium -- 실제 메인넷 토큰 스왑, 가스비 변동 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet 또는 Polygon Mainnet EVM 지갑 보유
- [ ] ETH 보유 (스왑 금액 + 가스비, 최소 0.005 ETH). Polygon 사용 시 POL + 스왑할 토큰 보유

## Scenario Steps

### Step 1: 잔액 조회
**Action**: 대상 네트워크에서 ETH/토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: ETH 잔액이 0.005 이상인지 확인. Polygon 사용 시 `network=polygon-mainnet`으로 변경

### Step 2: 0x 스왑 Dry-Run
**Action**: ETH -> USDC 스왑을 dry-run으로 실행하여 예상 수령량과 가스비를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "0x-swap",
    "params": {
      "sellToken": "ETH",
      "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "sellAmount": "0.001"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 예상 USDC 수령량, 스왑 경로, 가스비가 반환된다
**Check**: `buyAmount`(예상 USDC), `estimatedGas`, `gasPrice` 확인. 가스비가 $10을 초과하면 사용자에게 경고하고 Polygon 대안 안내

### Step 3: 사용자 승인
**Action**: 스왑 비율 및 예상 수령량을 사용자에게 표시하고 승인을 요청한다.
- 스왑: 0.001 ETH -> {buyAmount} USDC
- 예상 가스비: {estimatedGas} (~${gasCostUsd})
- USDC contract: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

**Check**: 사용자가 스왑 조건을 확인하고 승인. Polygon에서 실행 시 가스비가 크게 절감됨을 안내

### Step 4: 실제 스왑 실행
**Action**: 사용자 승인 후 실제 0x 스왑을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "0x-swap",
    "params": {
      "sellToken": "ETH",
      "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "sellAmount": "0.001"
    },
    "network": "ethereum-mainnet"
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
**Check**: `status` 필드 확인. Ethereum ~15초 블록타임, 1-2분 내 컨펌 기대

### Step 6: 잔액 재확인
**Action**: 스왑 후 잔액을 재조회하여 ETH 감소, USDC 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: ETH 잔액이 0.001 ETH + 가스비만큼 감소, USDC 토큰 잔액이 증가
**Check**: ETH 감소분 확인, USDC 잔액이 dry-run 예상치와 유사한지 확인

## Verification
- [ ] ETH/토큰 잔액 조회 성공 (200 응답)
- [ ] 0x 스왑 dry-run 성공 (예상 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스왑 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스왑 후 ETH 감소, USDC 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 0x swap (ETH sell) | ethereum-mainnet | ~150,000 | ~$3-5 |
| USDC approve (첫 스왑) | ethereum-mainnet | ~46,000 | ~$1-2 |
| 0x swap | polygon-mainnet | ~150,000 | ~$0.05 |
| **Total (Ethereum)** | | | **~$5.00** |
| **Total (Polygon)** | | | **~$0.05** |

> **Note**: Polygon에서 실행 시 가스비가 $0.05 이하로 대폭 절감된다. 첫 스왑 시 USDC 토큰 approve가 필요할 수 있다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient ETH for gas | ETH 잔액으로 가스비 지불 불가 | 최소 0.005 ETH 확보 필요 |
| 0x API rate limit | API 요청 빈도 초과 | 요청 간 1초 간격 유지, 잠시 후 재시도 |
| Price impact too high | 스왑 금액 대비 유동성 부족 | 스왑 금액을 줄이거나 다른 토큰 쌍 사용 |
| USDC approve needed | 첫 스왑 시 토큰 승인 필요 | approve 트랜잭션 먼저 실행 |
| Gas price spike | 네트워크 혼잡 | Polygon으로 전환 또는 혼잡 완화 후 재시도 |
