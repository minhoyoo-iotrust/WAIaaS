---
id: "mainnet-04"
title: "SPL USDC 전송"
category: "mainnet"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.001"
risk_level: "medium"
tags: ["transfer", "spl", "usdc", "token", "mainnet"]
---

# SPL USDC 전송

## Metadata
- **ID**: mainnet-04
- **Category**: mainnet
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.001
- **Risk Level**: medium -- 실제 메인넷 자금 사용, 다만 Solana 수수료가 매우 저렴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (tx fee용, 최소 0.01 SOL)
- [ ] USDC SPL 토큰 보유 (최소 0.01 USDC). USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## Scenario Steps

### Step 1: 토큰 잔액 조회
**Action**: Solana Mainnet에서 지갑의 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, SOL 잔액과 SPL 토큰 목록이 반환된다
**Check**: 토큰 목록에서 USDC(EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)가 있는지 확인

### Step 2: Dry-Run SPL 자기 전송
**Action**: USDC SPL 토큰을 자기 주소로 전송하는 dry-run을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "0.01",
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 예상 수수료가 반환된다
**Check**: `estimatedFee` 확인 (~0.000005 SOL)

### Step 3: 실제 SPL 자기 전송
**Action**: dry-run 확인 후 실제 USDC SPL 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TOKEN_TRANSFER",
    "to": "<MY_ADDRESS>",
    "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "0.01",
    "network": "solana-mainnet"
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
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success` (~1초 컨펌)
**Check**: `status` 필드 확인

### Step 5: 토큰 잔액 재확인
**Action**: 전송 후 토큰 잔액과 SOL 잔액을 재조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: USDC 잔액 불변 (자기 전송), SOL만 tx fee 감소
**Check**: USDC 잔액이 Step 1과 동일한지 확인. SOL 감소분이 ~0.000005 SOL 이내

## Verification
- [ ] SPL 토큰 잔액 조회 성공 (USDC 확인)
- [ ] Dry-run 성공 (예상 수수료 반환)
- [ ] TOKEN_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] USDC 잔액 불변 (자기 전송), SOL만 tx fee 감소

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| SPL (USDC) self-transfer | solana-mainnet | ~5,000 lamports | ~$0.001 |
| **Total** | | | **~$0.001** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient SOL for fee | SOL 부족 | 최소 0.01 SOL 확보 필요 |
| USDC not found in token list | USDC 미보유 | USDC 구매 또는 다른 SPL 토큰으로 대체 |
| Token account not found | 수신 토큰 계정 미존재 | 자기 전송이므로 발생하지 않아야 함 |
| RPC rate limit | Mainnet RPC 요청 제한 | RPC Pool 설정 확인, 대체 엔드포인트 사용 |
