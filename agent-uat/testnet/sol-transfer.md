---
id: "testnet-02"
title: "Devnet SOL 전송"
category: "testnet"
auth: "session"
network: ["solana-devnet"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "low"
tags: ["transfer", "sol", "native", "devnet"]
---

# Devnet SOL 전송

## Metadata
- **ID**: testnet-02
- **Category**: testnet
- **Network**: solana-devnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0
- **Risk Level**: low -- Devnet 자금 무료, 자기 전송 패턴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Devnet 네트워크 설정된 Solana 지갑 보유
- [ ] Devnet SOL 보유 (최소 0.1 SOL). Airdrop: `solana airdrop 1 --url devnet` 또는 https://faucet.solana.com

## Scenario Steps

### Step 1: 지갑 잔액 조회
**Action**: Devnet에서 Solana 지갑 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-devnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Devnet SOL 잔액이 반환된다
**Check**: `balance` 필드가 0.1 SOL 이상인지 확인. 부족하면 airdrop 안내

### Step 2: Simulate 자기 전송
**Action**: 자기 주소로 0.01 SOL을 전송하는 simulate을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "amount": "10000000",
    "network": "solana-devnet"
  }'
```
**Expected**: 200 OK, 예상 트랜잭션 수수료가 반환된다
**Check**: `estimatedFee` 필드 확인 (~0.000005 SOL)

### Step 3: 실제 자기 전송 실행
**Action**: simulate 확인 후 실제 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "amount": "10000000",
    "network": "solana-devnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 signature가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 4: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드가 최종 상태인지 확인. Solana는 빠르게 컨펌됨 (~1초)

### Step 5: 전송 후 잔액 재확인
**Action**: 전송 후 잔액을 재조회하여 수수료만큼만 감소했는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-devnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 tx fee(~0.000005 SOL)만큼만 감소했다
**Check**: `이전 잔액 - 현재 잔액 ≈ 0.000005 SOL` 확인

## Verification
- [ ] Devnet SOL 잔액 조회 성공 (200 응답)
- [ ] Simulate 성공 (예상 수수료 반환)
- [ ] 자기 전송 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 전송 후 잔액 감소분이 tx fee(~0.000005 SOL) 이내

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| SOL self-transfer | solana-devnet | ~5,000 lamports | ~$0 |
| **Total** | | | **~$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient funds | Devnet SOL 부족 | `solana airdrop 1 --url devnet` 또는 https://faucet.solana.com |
| Transaction failed | Devnet 불안정 | 잠시 대기 후 재시도. Devnet은 간헐적으로 불안정할 수 있음 |
| Blockhash expired | 트랜잭션 제출 지연 | 즉시 재시도 (새 blockhash 자동 할당) |
| 404 Wallet not found | 잘못된 WALLET_ID | `GET /v1/wallets`로 Solana 지갑 ID 확인 |
| RPC rate limit | Devnet RPC 요청 제한 | 5초 대기 후 재시도 |
