---
id: "mainnet-01"
title: "ETH 전송"
category: "mainnet"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "0.50"
risk_level: "medium"
tags: ["transfer", "eth", "native", "mainnet"]
---

# ETH 전송

## Metadata
- **ID**: mainnet-01
- **Category**: mainnet
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.50
- **Risk Level**: medium -- 실제 메인넷 자금 사용, 가스비 변동 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (가스비 포함 최소 0.002 ETH)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: Ethereum Mainnet에서 지갑 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: `balance` 필드가 0.002 ETH 이상인지 확인

### Step 2: Simulate 자기 전송
**Action**: 자기 주소로 0.001 ETH를 전송하는 simulate을 실행한다. **반드시 가스비를 확인하고 사용자 승인을 받는다.**
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 예상 가스비와 총 비용이 반환된다
**Check**: `estimatedGas` (~21,000), `gasPrice`, `totalCost` 확인. 예상 비용이 $1.00을 초과하면 사용자에게 경고하고 진행 확인

### Step 3: 실제 자기 전송 실행
**Action**: 사용자 승인 후 실제 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 4: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인. Ethereum Mainnet은 ~15초 블록타임, 1-2분 내 컨펌 기대

### Step 5: 잔액 재확인
**Action**: 전송 후 잔액을 재조회하여 가스비만큼만 감소했는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 가스비만큼만 감소 (자기 전송이므로 0.001 ETH는 돌아옴)
**Check**: `이전 잔액 - 현재 잔액 = 가스비` 확인

## Verification
- [ ] ETH 잔액 조회 성공 (200 응답)
- [ ] Simulate 성공 (예상 가스비 반환, 사용자 승인 완료)
- [ ] 자기 전송 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 전송 후 잔액 감소분이 가스비 이내

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ETH self-transfer | ethereum-mainnet | ~21,000 | ~$0.50 |
| **Total** | | | **~$0.50** |

> **Note**: Mainnet 가스 가격은 네트워크 혼잡도에 따라 크게 변동할 수 있다. Simulate으로 반드시 사전 확인할 것.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Gas price too high | 네트워크 혼잡 | https://etherscan.io/gastracker 에서 가스 가격 확인, 혼잡 시 대기 |
| Insufficient funds | ETH 부족 | 최소 0.002 ETH 확보 필요 |
| Transaction pending too long | 가스 가격 너무 낮음 | pending 상태 지속 시 speedup 또는 대기 |
| Nonce too low | 이전 pending 트랜잭션 존재 | pending 트랜잭션 완료 대기 후 재시도 |
