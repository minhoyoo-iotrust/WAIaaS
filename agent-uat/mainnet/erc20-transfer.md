---
id: "mainnet-03"
title: "ERC-20 USDC 전송"
category: "mainnet"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "1.00"
risk_level: "medium"
tags: ["transfer", "erc20", "usdc", "token", "mainnet"]
---

# ERC-20 USDC 전송

## Metadata
- **ID**: mainnet-03
- **Category**: mainnet
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$1.00
- **Risk Level**: medium -- 실제 메인넷 자금 사용, ERC-20 전송 가스비가 네이티브보다 높음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (가스비용, 최소 0.003 ETH)
- [ ] USDC 보유 (최소 0.01 USDC). USDC contract: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

## Scenario Steps

### Step 1: 토큰 잔액 조회
**Action**: Ethereum Mainnet에서 지갑의 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액과 토큰 잔액 목록이 반환된다
**Check**: 토큰 목록에서 USDC가 있는지 확인. USDC 잔액 기록

### Step 2: Simulate ERC-20 자기 전송
**Action**: USDC를 자기 주소로 전송하는 simulate을 실행한다. **가스비를 확인하고 사용자 승인을 받는다.**
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": { "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6, "symbol": "USDC" },
    "amount": "10000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 예상 가스비가 반환된다 (~65,000 gas)
**Check**: `estimatedGas`, `totalCost` 확인. 비용이 $2.00 초과 시 사용자 경고

### Step 3: 실제 ERC-20 자기 전송
**Action**: 사용자 승인 후 실제 USDC 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": { "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6, "symbol": "USDC" },
    "amount": "10000",
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
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`
**Check**: `status` 필드 확인

### Step 5: 토큰 잔액 재확인
**Action**: 전송 후 토큰 잔액과 ETH 잔액을 재조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: USDC 잔액 불변 (자기 전송), ETH만 가스비 감소
**Check**: USDC 잔액이 Step 1과 동일한지 확인. ETH 감소분이 가스비 범위 이내

## Verification
- [ ] 토큰 잔액 조회 성공 (USDC 확인)
- [ ] Simulate 성공 (예상 가스비 ~65,000 gas, 사용자 승인 완료)
- [ ] TOKEN_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] USDC 잔액 불변 (자기 전송), ETH만 가스비 감소

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ERC-20 (USDC) self-transfer | ethereum-mainnet | ~65,000 | ~$1.00 |
| **Total** | | | **~$1.00** |

> **Note**: ERC-20 전송은 네이티브 ETH 전송보다 가스비가 약 3배 높다. Simulate으로 사전 확인 필수.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient ETH for gas | ETH 부족 (USDC는 있지만 가스비 ETH 부족) | ETH 충전 필요 (최소 0.003 ETH) |
| USDC balance is 0 | USDC 미보유 | USDC 구매 또는 다른 보유 ERC-20 토큰으로 대체 |
| Execution reverted | 토큰 컨트랙트 호출 실패 | 토큰 주소 정확성 확인, amount가 보유량 이하인지 확인 |
| Gas price spike | 네트워크 혼잡 | https://etherscan.io/gastracker 확인, 가스비 안정 시 재시도 |
