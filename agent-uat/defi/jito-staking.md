---
id: "defi-06"
title: "Jito SOL Staking"
category: "defi"
auth: "session"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "medium"
tags: ["defi", "staking", "jito", "solana", "liquid-staking"]
---

# Jito SOL Staking

## Metadata
- **ID**: defi-06
- **Category**: defi
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: medium -- 실제 메인넷 SOL 스테이킹, liquid staking 토큰(JitoSOL) 수령

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (최소 0.05 SOL -- 스테이킹 최소 금액 + tx fee)

## Scenario Steps

### Step 1: SOL 잔액 조회
**Action**: Solana Mainnet에서 SOL 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, SOL 잔액이 반환된다
**Check**: SOL 잔액이 0.01 이상인지 확인

### Step 2: Jito 스테이킹 Simulate
**Action**: SOL -> JitoSOL 스테이킹을 simulate으로 실행하여 예상 JitoSOL 수령량을 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/stake?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "humanAmount": "0.05",
      "decimals": 9
    }
  }'
```
**Expected**: 200 OK, 예상 JitoSOL 수령량과 현재 환율이 반환된다
**Check**: `outputAmount`(예상 JitoSOL), `exchangeRate`(SOL:JitoSOL 비율) 확인

### Step 3: 사용자 승인 후 실제 스테이킹
**Action**: 사용자에게 스테이킹 조건을 표시하고 승인 후 실행한다.
- 스테이킹: 0.05 SOL -> {outputAmount} JitoSOL
- 환율: 1 SOL = {exchangeRate} JitoSOL
- JitoSOL mint: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`

```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/stake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "humanAmount": "0.05",
      "decimals": 9
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx signature가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 4: 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인. 수 초 내 컨펌 기대

### Step 5: 잔액 재확인
**Action**: 스테이킹 후 잔액을 재조회하여 SOL 감소, JitoSOL 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: SOL 잔액이 ~0.05 SOL + tx fee만큼 감소, JitoSOL 토큰이 잔액에 표시
**Check**: SOL 감소 확인, JitoSOL (mint: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`) 잔액 증가 확인

### Step 6: (선택) 언스테이킹 Simulate
**Action**: JitoSOL -> SOL 언스테이킹을 simulate으로 확인한다. 실제 실행은 사용자 선택.
```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/unstake?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "humanAmount": "0.05",
      "decimals": 9
    }
  }'
```
**Expected**: 200 OK, 예상 SOL 반환량이 표시된다
**Check**: 실제 실행 여부는 사용자에게 확인. 언스테이킹 시 JitoSOL이 감소하고 SOL이 증가

## Verification
- [ ] SOL 잔액 조회 성공 (200 응답)
- [ ] Jito 스테이킹 simulate 성공 (예상 JitoSOL 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스테이킹 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스테이킹 후 SOL 감소, JitoSOL 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Jito stake tx fee | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Priority fee | solana-mainnet | variable | ~$0.005 |
| **Total** | | | **~$0.01** |

> **Note**: 0.05 SOL이 JitoSOL로 변환된다. 최소 스테이킹 금액은 0.05 SOL이다. JitoSOL은 스테이킹 보상이 자동 누적되어 시간이 지나면 SOL 대비 가치가 상승한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient SOL | SOL 잔액 부족 | 최소 0.01 SOL 확보 필요 |
| Jito validator capacity | Jito 밸리데이터 용량 초과 | 잠시 후 재시도, 또는 다른 liquid staking 프로토콜 사용 |
| JitoSOL not showing | 토큰 계정 미생성 | 첫 스테이킹 시 자동 생성됨, 잔액 조회 재시도 |
| Transaction simulation failed | 프로그램 오류 | amount 조정 후 재시도 |
| Unstake delayed | 언스테이킹 대기 기간 | Jito 인스턴트 언스테이크 또는 epoch 종료 대기 |
