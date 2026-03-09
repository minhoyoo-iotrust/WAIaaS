---
id: "testnet-05"
title: "Devnet SPL 전송"
category: "testnet"
network: ["solana-devnet"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "low"
tags: ["transfer", "spl", "token", "devnet"]
---

# Devnet SPL 전송

## Metadata
- **ID**: testnet-05
- **Category**: testnet
- **Network**: solana-devnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0
- **Risk Level**: low -- Devnet 자금 무료, 자기 전송 패턴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Devnet 네트워크 설정된 Solana 지갑 보유
- [ ] Devnet SOL 보유 (tx fee용, 최소 0.01 SOL)
- [ ] Devnet SPL 테스트 토큰 보유. 직접 생성 방법:
  ```bash
  # 1. 테스트 토큰 민트 생성
  spl-token create-token --url devnet
  # 2. 토큰 계정 생성
  spl-token create-account <MINT_ADDRESS> --url devnet
  # 3. 토큰 민팅
  spl-token mint <MINT_ADDRESS> 100 --url devnet
  ```

## Scenario Steps

### Step 1: 토큰 잔액 조회
**Action**: Devnet에서 Solana 지갑의 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-devnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 네이티브 SOL 잔액과 SPL 토큰 목록이 반환된다
**Check**: 토큰 목록에서 전송할 SPL 토큰이 있는지 확인. `MINT_ADDRESS` 기록

### Step 2: Dry-Run SPL 자기 전송
**Action**: 자기 주소로 SPL 토큰을 전송하는 dry-run을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": "<MINT_ADDRESS>",
    "amount": "1",
    "network": "solana-devnet"
  }'
```
**Expected**: 200 OK, 예상 트랜잭션 수수료가 반환된다
**Check**: `estimatedFee` 필드 확인 (~0.000005 SOL)

### Step 3: 실제 SPL 자기 전송
**Action**: dry-run 확인 후 실제 SPL 토큰 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": "<MINT_ADDRESS>",
    "amount": "1",
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
**Check**: `status` 필드 확인. Solana는 빠르게 컨펌됨

### Step 5: 토큰 잔액 재확인
**Action**: 전송 후 토큰 잔액과 SOL 잔액을 재조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-devnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: SPL 토큰 잔액 불변 (자기 전송), SOL만 tx fee만큼 감소
**Check**: SPL 토큰 잔액이 Step 1과 동일한지 확인. SOL 감소분이 ~0.000005 SOL 이내

## Verification
- [ ] Devnet SPL 토큰 잔액 조회 성공
- [ ] Dry-run 성공 (예상 수수료 반환)
- [ ] TOKEN_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] SPL 토큰 잔액 불변 (자기 전송), SOL만 tx fee 감소

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| SPL self-transfer | solana-devnet | ~5,000 lamports | ~$0 |
| **Total** | | | **~$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| No SPL tokens found | SPL 토큰 미보유 | Prerequisites의 토큰 생성 가이드 참고하여 테스트 토큰 생성 |
| Insufficient SOL for fee | Devnet SOL 부족 | `solana airdrop 1 --url devnet` 실행 |
| Token account not found | 수신 토큰 계정 미존재 | 자기 전송이므로 발생하지 않아야 함. 토큰 계정 존재 확인 |
| Transaction simulation failed | Devnet 불안정 또는 잘못된 파라미터 | 파라미터 확인 후 재시도 |
| Invalid mint address | 잘못된 민트 주소 | Solana Explorer (Devnet)에서 민트 주소 검증 |
