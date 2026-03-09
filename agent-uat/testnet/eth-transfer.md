---
id: "testnet-02"
title: "Sepolia ETH 전송"
category: "testnet"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "low"
tags: ["transfer", "eth", "native", "sepolia"]
---

# Sepolia ETH 전송

## Metadata
- **ID**: testnet-02
- **Category**: testnet
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: low -- Testnet 자금만 사용, 자기 전송 패턴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Sepolia 네트워크 설정된 EVM 지갑 보유
- [ ] Sepolia ETH 보유 (최소 0.002 ETH). Faucet: https://sepoliafaucet.com 또는 https://faucets.chain.link/sepolia

## Scenario Steps

### Step 1: 지갑 잔액 조회
**Action**: Sepolia 네트워크에서 지갑 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Sepolia ETH 잔액이 반환된다
**Check**: `balance` 필드가 0.002 ETH 이상인지 확인. 잔액이 부족하면 faucet에서 충전 안내

### Step 2: Dry-Run 자기 전송
**Action**: 자기 주소로 0.001 ETH를 전송하는 dry-run을 실행하여 예상 가스비를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 예상 가스비와 총 비용이 반환된다
**Check**: `estimatedGas`, `gasPrice`, `totalCost` 필드 확인. 예상 비용이 `estimated_cost_usd`의 2배를 초과하면 사용자에게 경고

### Step 3: 실제 자기 전송 실행
**Action**: dry-run 확인 후 실제 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 4: 트랜잭션 상태 확인
**Action**: 트랜잭션이 컨펌될 때까지 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드가 최종 상태(confirmed/success)인지 확인. pending이면 10초 후 재조회

### Step 5: 전송 후 잔액 재확인
**Action**: 전송 후 잔액을 재조회하여 가스비만큼만 감소했는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 가스비만큼만 감소했다 (자기 전송이므로 0.001 ETH는 그대로)
**Check**: `이전 잔액 - 현재 잔액 = 가스비` 확인. 가스비가 0.001 ETH 이하인지 확인

## Verification
- [ ] Sepolia ETH 잔액 조회 성공 (200 응답)
- [ ] Dry-run 성공 (예상 가스비 반환)
- [ ] 자기 전송 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 전송 후 잔액 감소분이 가스비 이내 (자기 전송이므로 전송액 불변)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ETH self-transfer | ethereum-sepolia | ~21,000 | ~$0.01 |
| **Total** | | | **~$0.01** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient funds | Sepolia ETH 부족 | Faucet에서 Sepolia ETH 충전: https://sepoliafaucet.com |
| Nonce too low | 이전 트랜잭션 pending 중 | pending 트랜잭션 완료 대기 후 재시도 |
| Transaction underpriced | 가스 가격이 네트워크 최소치 미만 | dry-run으로 적정 가스비 재확인 |
| 404 Wallet not found | 잘못된 WALLET_ID | `GET /v1/wallets`로 정확한 지갑 ID 확인 |
| Network mismatch | 지갑이 Sepolia 미지원 | EVM 지갑인지 확인, 네트워크 설정 확인 |
