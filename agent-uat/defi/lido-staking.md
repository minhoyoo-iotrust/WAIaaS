---
id: "defi-05"
title: "Lido ETH Staking"
category: "defi"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "3.00"
risk_level: "medium"
tags: ["defi", "staking", "lido", "ethereum", "liquid-staking"]
---

# Lido ETH Staking

## Metadata
- **ID**: defi-05
- **Category**: defi
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$3.00
- **Risk Level**: medium -- 실제 메인넷 ETH 스테이킹, liquid staking 토큰(stETH) 수령

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (최소 0.01 ETH -- 스테이킹 금액 + 가스비)

## Scenario Steps

### Step 1: ETH 잔액 조회
**Action**: Ethereum Mainnet에서 ETH 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: ETH 잔액이 0.01 이상인지 확인

### Step 2: Lido 스테이킹 Simulate
**Action**: ETH -> stETH 스테이킹을 simulate으로 실행하여 예상 stETH 수령량을 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "lido-stake",
    "params": {
      "amount": "0.005"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 예상 stETH 수령량과 가스비가 반환된다
**Check**: `outputAmount`(예상 stETH), `estimatedGas` 확인. stETH는 ETH와 거의 1:1 비율

### Step 3: 사용자 승인 후 실제 스테이킹
**Action**: 사용자에게 스테이킹 조건을 표시하고 승인 후 실행한다.
- 스테이킹: 0.005 ETH -> ~0.005 stETH
- stETH contract: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`
- 예상 가스: ~100,000 gas (~$3.00)

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "lido-stake",
    "params": {
      "amount": "0.005"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 4: 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인. 1-2분 내 컨펌 기대

### Step 5: 잔액 재확인
**Action**: 스테이킹 후 잔액을 재조회하여 ETH 감소, stETH 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: ETH 잔액이 ~0.005 ETH + 가스비만큼 감소, stETH 토큰 잔액이 증가
**Check**: ETH 감소 확인, stETH (contract: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) 잔액 ~0.005 확인

### Step 6: stETH 리베이싱 안내
**Action**: stETH는 리베이싱 토큰으로, 시간이 지나면 잔액이 자동으로 소량 증가한다는 점을 사용자에게 안내한다.
- stETH 잔액은 Lido 스테이킹 보상에 따라 매일 소량 증가
- 즉시 확인 시 스테이킹 직후 잔액과 동일
- 하루 후 재확인하면 소량 증가 확인 가능

**Check**: 사용자에게 리베이싱 메커니즘 설명 완료

### Step 7: Lido 언스테이킹 (optional)
**Action**: stETH를 ETH로 언스테이킹한다. Lido withdrawal 큐를 통해 처리되며, 완료까지 1~5일 소요된다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "lido-unstake",
    "params": {
      "amount": "0.005"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, withdrawal request NFT가 발행된다
**Check**: `txId`, `txHash` 필드 기록. Lido withdrawal은 큐 기반이므로 즉시 ETH가 반환되지 않음

### Step 8: 언스테이킹 상태 확인 (optional)
**Action**: 언스테이킹 트랜잭션 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<UNSTAKE_TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 status가 `confirmed`로 전환
**Check**: withdrawal request가 정상 등록됨. 실제 ETH 수령은 Lido finalization 후 claim 필요 (1~5일 후)

> **Note**: Lido 언스테이킹은 두 단계로 진행된다: (1) withdrawal request 생성 (이 스텝), (2) finalization 후 claim. Claim은 Lido 프로토콜이 요청을 처리한 후에만 가능하며, 별도의 `lido-claim` 액션이 필요하다.

## Verification
- [ ] ETH 잔액 조회 성공 (200 응답)
- [ ] Lido 스테이킹 simulate 성공 (예상 stETH 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스테이킹 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스테이킹 후 ETH 감소, stETH 증가 확인
- [ ] (optional) Lido 언스테이킹 withdrawal request 생성 성공
- [ ] (optional) 언스테이킹 트랜잭션 컨펌 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Lido stake | ethereum-mainnet | ~100,000 | ~$3.00 |
| **Total** | | | **~$3.00** |

> **Note**: 0.005 ETH가 stETH로 변환된다. stETH는 리베이싱으로 보상이 자동 누적되며, DeFi 프로토콜에서 담보로 사용 가능하다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient ETH | ETH 잔액 부족 | 최소 0.01 ETH 확보 필요 (스테이킹 + 가스) |
| Lido staking paused | Lido 프로토콜 일시 정지 (매우 드문 경우) | Lido 상태 페이지 확인, 재개 후 재시도 |
| stETH not showing | 토큰 인덱싱 지연 | 잔액 조회 재시도, stETH contract 직접 조회 |
| Gas price too high | 네트워크 혼잡 | 혼잡 완화 후 재시도, 가스 추적기 확인 |
| stETH balance mismatch | 리베이싱 타이밍 | 다음 리베이스 사이클 후 재확인 |
