---
id: "defi-10"
title: "Drift Perpetual Trading"
category: "defi"
auth: "session"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "medium"
tags: ["defi", "perp", "drift", "solana", "perpetual"]
---

# Drift Perpetual Trading

## Metadata
- **ID**: defi-10
- **Category**: defi
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: medium -- 실제 메인넷 Drift 프로토콜 사용, 주문 체결 위험 관리 필요

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (tx fee, 최소 0.01 SOL)
- [ ] USDC 보유 (최소 5 USDC, Drift deposit용)

## Scenario Steps

### Step 1: USDC 잔액 조회
**Action**: Solana Mainnet에서 USDC 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 목록에 USDC 잔액이 포함된다
**Check**: USDC 잔액이 5.0 이상인지 확인

### Step 2: Drift 계정 확인
**Action**: Drift sub-account가 존재하는지 확인한다. 없으면 초기화가 필요할 수 있다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=drift&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Drift 계정 정보 또는 빈 포지션 목록이 반환된다
**Check**: Drift sub-account 존재 여부 확인. 미존재 시 첫 deposit에서 자동 생성

### Step 3: USDC Deposit Simulate
**Action**: Drift에 5.0 USDC를 deposit하는 simulate을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "drift-deposit",
    "params": {
      "amount": "5.0",
      "market": "USDC"
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 예상 tx fee가 반환된다
**Check**: `estimatedFee` 확인

### Step 4: 사용자 승인 후 실제 Deposit
**Action**: 사용자 승인 후 USDC를 Drift에 deposit한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "drift-deposit",
    "params": {
      "amount": "5.0",
      "market": "USDC"
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx signature가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: Deposit 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: SOL-PERP 리밋 주문 생성
**Action**: SOL-PERP 리밋 매수 주문을 생성한다. **체결 방지를 위해 시장가 대비 충분히 낮은 가격($10)으로 설정한다.**
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "drift-perp-order",
    "params": {
      "market": "SOL-PERP",
      "side": "buy",
      "size": "0.1",
      "price": "10",
      "orderType": "limit"
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 주문 ID가 반환된다
**Check**: `orderId` 기록. 가격 $10은 현재 SOL 시장가($100+) 대비 충분히 낮아 체결되지 않음

### Step 7: 주문 확인
**Action**: 생성된 주문이 open orders에 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=drift&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, open orders 목록에 SOL-PERP buy limit order가 포함된다
**Check**: SOL-PERP buy limit $10 주문이 open 상태로 표시

### Step 8: 주문 취소
**Action**: 생성한 Perp 주문을 취소한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "drift-perp-cancel",
    "params": {
      "market": "SOL-PERP",
      "orderId": "<ORDER_ID>"
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 주문 취소 성공
**Check**: 취소 확인 응답

### Step 9: (선택) Withdraw Simulate
**Action**: Drift에서 USDC를 인출하는 simulate을 확인한다. 실제 실행은 사용자 선택.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "drift-withdraw",
    "params": {
      "amount": "5.0",
      "market": "USDC"
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 예상 USDC 반환량이 표시된다
**Check**: 실제 실행 여부는 사용자에게 확인

## Verification
- [ ] USDC 잔액 조회 성공 (200 응답)
- [ ] Drift 계정 확인 완료
- [ ] USDC deposit simulate 성공
- [ ] 사용자 승인 완료
- [ ] 실제 deposit 트랜잭션 성공 (txId, txHash 반환)
- [ ] SOL-PERP 리밋 주문 생성 성공 (체결 방지 가격)
- [ ] Open orders에서 주문 확인
- [ ] 주문 취소 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Drift deposit tx | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Perp order tx | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Order cancel tx | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Priority fees | solana-mainnet | variable | ~$0.005 |
| **Total** | | | **~$0.01** |

> **Note**: 5.0 USDC가 Drift에 deposit된다. 주문은 취소하므로 실제 거래 손익은 없다. Withdraw로 USDC 회수 가능.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Drift account not initialized | 첫 사용 시 sub-account 미존재 | 첫 deposit에서 자동 초기화, 또는 별도 init 호출 |
| Insufficient margin | USDC 잔액 부족 | 최소 5 USDC deposit 필요 |
| Order immediately filled | 주문 가격이 시장가에 근접 | 가격을 현재 시장가의 10% 이하로 설정 ($10 권장) |
| Transaction simulation failed | Drift 프로그램 오류 | params 확인 후 재시도 |
| Withdraw failed | open positions 존재 | 모든 주문 취소 후 withdraw 시도 |
