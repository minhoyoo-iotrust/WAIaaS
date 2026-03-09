---
id: "mainnet-02"
title: "SOL 전송"
category: "mainnet"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.001"
risk_level: "medium"
tags: ["transfer", "sol", "native", "mainnet"]
---

# SOL 전송

## Metadata
- **ID**: mainnet-02
- **Category**: mainnet
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.001
- **Risk Level**: medium -- 실제 메인넷 자금 사용, 다만 수수료가 매우 저렴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (최소 0.01 SOL)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: Solana Mainnet에서 지갑 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, SOL 잔액이 반환된다
**Check**: `balance` 필드가 0.01 SOL 이상인지 확인

### Step 2: Dry-Run 자기 전송
**Action**: 자기 주소로 0.001 SOL을 전송하는 dry-run을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "value": "0.001",
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 예상 수수료가 반환된다
**Check**: `estimatedFee` 확인 (~0.000005 SOL, ~$0.001)

### Step 3: 실제 자기 전송 실행
**Action**: dry-run 확인 후 실제 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ADDRESS>",
    "value": "0.001",
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
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success` (Solana ~1초 컨펌)
**Check**: `status` 필드 확인

### Step 5: 잔액 재확인
**Action**: 전송 후 잔액을 재조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 tx fee(~0.000005 SOL)만큼만 감소
**Check**: `이전 잔액 - 현재 잔액 ≈ 0.000005 SOL` 확인

## Verification
- [ ] SOL 잔액 조회 성공 (200 응답)
- [ ] Dry-run 성공 (예상 수수료 반환)
- [ ] 자기 전송 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 전송 후 잔액 감소분이 tx fee(~0.000005 SOL) 이내

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| SOL self-transfer | solana-mainnet | ~5,000 lamports | ~$0.001 |
| **Total** | | | **~$0.001** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient funds | SOL 부족 | 최소 0.01 SOL 확보 필요 |
| Transaction failed | RPC 노드 문제 | 잠시 대기 후 재시도 |
| Blockhash expired | 트랜잭션 제출 지연 | 즉시 재시도 (새 blockhash 자동 할당) |
| RPC rate limit | Mainnet RPC 요청 제한 | RPC Pool 설정 확인, 대체 엔드포인트 사용 |
