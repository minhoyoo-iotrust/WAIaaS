---
id: "defi-07"
title: "Aave V3 Lending (USDC Supply)"
category: "defi"
auth: "session"
network: ["ethereum-mainnet", "polygon-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "lending", "aave", "evm", "supply"]
---

# Aave V3 Lending (USDC Supply)

## Metadata
- **ID**: defi-07
- **Category**: defi
- **Network**: ethereum-mainnet, polygon-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00 (Ethereum), ~$0.05 (Polygon)
- **Risk Level**: medium -- 실제 메인넷 USDC를 Aave V3에 공급, 프로토콜 리스크 존재

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] EVM 지갑 보유 (Ethereum Mainnet 또는 Polygon Mainnet)
- [ ] ETH/POL 보유 (가스비, Ethereum ~0.01 ETH / Polygon ~0.1 POL)
- [ ] USDC 보유 (최소 1 USDC). USDC 주소: Ethereum `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, Polygon `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

## Scenario Steps

### Step 1: USDC 토큰 잔액 조회
**Action**: 대상 네트워크에서 USDC 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 목록에 USDC 잔액이 포함된다
**Check**: USDC 잔액이 1.0 이상인지 확인. Polygon 사용 시 `network=polygon-mainnet`으로 변경

### Step 2: Aave V3 마켓 정보 확인
**Action**: Aave V3 USDC reserve의 현재 supply APY를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=aave&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Aave 마켓 정보 또는 기존 포지션이 반환된다
**Check**: USDC supply APY, 기존 포지션 유무 확인

### Step 3: Aave USDC Supply Simulate
**Action**: USDC 1.0을 Aave V3에 supply하는 simulate을 실행한다. approve는 aave_supply 내부에서 자동 처리된다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/aave_v3/aave_supply?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 예상 aToken 수령량과 가스비가 반환된다
**Check**: `estimatedGas` 확인

### Step 4: 사용자 승인 후 실제 Supply 실행
**Action**: 사용자에게 supply 조건을 표시하고 승인 후 실행한다.
- Supply: 1.0 USDC -> Aave V3 USDC pool
- 예상 수령: ~1.0 aUSDC
- 예상 가스비: ~${gasCostUsd}

```bash
curl -s -X POST http://localhost:3100/v1/actions/aave_v3/aave_supply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: Aave 포지션 확인
**Action**: Supply 후 Aave 포지션이 생성되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=aave&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, USDC supply 포지션이 표시된다
**Check**: supply 금액이 ~1.0 USDC로 표시되는지 확인, aUSDC 잔액 확인

### Step 7: (선택) Withdraw Simulate
**Action**: Aave에서 USDC를 인출하는 simulate을 확인한다. 실제 실행은 사용자 선택.
```bash
curl -s -X POST http://localhost:3100/v1/actions/aave_v3/aave_withdraw?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 예상 USDC 반환량이 표시된다
**Check**: 실제 실행 여부는 사용자에게 확인

## Verification
- [ ] USDC 잔액 조회 성공 (200 응답)
- [ ] Aave V3 마켓 정보 확인 (supply APY)
- [ ] Supply simulate 성공 (예상 aToken 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 supply 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] Aave 포지션에 USDC supply가 표시됨

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Aave supply (incl. approve) | ethereum-mainnet | ~250,000 | ~$3-5 |
| Aave supply (incl. approve) | polygon-mainnet | ~250,000 | ~$0.04 |
| **Total (Ethereum)** | | | **~$5.00** |
| **Total (Polygon)** | | | **~$0.05** |

> **Note**: Polygon에서 실행을 권장하여 가스비를 대폭 절감할 수 있다. 1.0 USDC가 Aave에 공급되어 이자를 누적한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Insufficient USDC | USDC 잔액 부족 | 최소 1 USDC 확보 필요 |
| Aave pool paused | Aave 거버넌스에 의한 일시 정지 | Aave 상태 확인, 재개 후 재시도 |
| aToken not showing | 인덱싱 지연 | 몇 초 후 포지션 조회 재시도 |
| Gas price too high | 네트워크 혼잡 | Polygon으로 전환하여 가스비 절감 |
