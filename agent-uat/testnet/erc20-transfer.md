---
id: "testnet-03"
title: "Sepolia ERC-20 전송"
category: "testnet"
auth: "session"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0.02"
risk_level: "low"
tags: ["transfer", "erc20", "token", "sepolia"]
---

# Sepolia ERC-20 전송

## Metadata
- **ID**: testnet-03
- **Category**: testnet
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.02
- **Risk Level**: low -- Testnet 자금만 사용, 자기 전송 패턴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Sepolia 네트워크 설정된 EVM 지갑 보유
- [ ] Sepolia ETH 보유 (가스비용, 최소 0.005 ETH)
- [ ] Sepolia 테스트 ERC-20 토큰 보유. 추천: Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) 또는 사용자 보유 ERC-20 토큰

## Scenario Steps

### Step 1: 토큰 잔액 조회
**Action**: Sepolia 네트워크에서 지갑의 토큰 잔액 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 네이티브 ETH 잔액과 토큰 잔액 목록이 반환된다
**Check**: 토큰 목록에서 전송할 ERC-20 토큰이 있는지 확인. `TOKEN_ADDRESS` 기록

### Step 2: Simulate ERC-20 자기 전송
**Action**: 자기 주소로 ERC-20 토큰을 전송하는 simulate을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": { "address": "<TOKEN_ADDRESS>", "decimals": "<TOKEN_DECIMALS>", "symbol": "<TOKEN_SYMBOL>" },
    "amount": "<AMOUNT_IN_MINIMUM_UNITS>",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 예상 가스비가 반환된다 (ERC-20 transfer는 ~65,000 gas)
**Check**: `estimatedGas` 필드 확인. 자기 전송이므로 approve 불필요

### Step 3: 실제 ERC-20 자기 전송
**Action**: simulate 확인 후 실제 토큰 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": { "address": "<TOKEN_ADDRESS>", "decimals": "<TOKEN_DECIMALS>", "symbol": "<TOKEN_SYMBOL>" },
    "amount": "<AMOUNT_IN_MINIMUM_UNITS>",
    "network": "ethereum-sepolia"
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
**Check**: `status` 필드 확인. pending이면 10초 후 재조회

### Step 5: 토큰 잔액 재확인
**Action**: 전송 후 토큰 잔액과 ETH 잔액을 재조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 토큰 잔액 불변 (자기 전송), ETH 잔액만 가스비만큼 감소
**Check**: ERC-20 토큰 잔액이 Step 1과 동일한지 확인. ETH 감소분이 가스비 범위 이내

## Verification
- [ ] 토큰 잔액 조회 성공 (ERC-20 토큰 목록 확인)
- [ ] Simulate 성공 (예상 가스비 ~65,000 gas)
- [ ] TOKEN_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 토큰 잔액 불변 (자기 전송), ETH만 가스비 감소

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ERC-20 self-transfer | ethereum-sepolia | ~65,000 | ~$0.02 |
| **Total** | | | **~$0.02** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient ETH for gas | Sepolia ETH 부족 | Faucet에서 Sepolia ETH 충전 |
| Token balance is 0 | ERC-20 토큰 미보유 | Sepolia USDC faucet 또는 테스트 토큰 전송 받기 |
| Execution reverted | 토큰 컨트랙트 오류 | 토큰 주소 정확성 확인, 다른 테스트 토큰 시도 |
| Invalid token address | 잘못된 토큰 컨트랙트 주소 | Etherscan Sepolia에서 토큰 주소 검증 |
| Transfer amount exceeds balance | 전송량 초과 | 보유 토큰 수량 확인 후 amount 조정 |
