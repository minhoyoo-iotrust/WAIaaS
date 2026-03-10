---
id: "testnet-05"
title: "Hyperliquid Spot/Perp 주문"
category: "testnet"
auth: "session"
network: ["hyperliquid-testnet"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "medium"
tags: ["hyperliquid", "spot", "perp", "order", "testnet"]
---

# Hyperliquid Spot/Perp 주문

## Metadata
- **ID**: testnet-05
- **Category**: testnet
- **Network**: hyperliquid-testnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0
- **Risk Level**: medium -- Testnet이지만 주문 생성/취소 포함, 실수 시 체결 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Admin Settings에서 Hyperliquid testnet 모드 활성화 (`hyperliquid_testnet=true`)
- [ ] Hyperliquid testnet 자금 보유. Drip faucet: https://app.hyperliquid-testnet.xyz/drip
- [ ] Hyperliquid testnet 연결 지갑 보유 (EVM 지갑)

## Scenario Steps

### Step 1: Hyperliquid 잔액 확인
**Action**: Hyperliquid testnet 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=hyperliquid-testnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Hyperliquid testnet 잔액이 반환된다
**Check**: USDC 잔액이 10 이상인지 확인. 부족하면 drip faucet 안내

### Step 2: Spot 리밋 주문 생성
**Action**: ETH Spot 리밋 매수 주문을 생성한다 (체결되지 않을 낮은 가격으로 설정).
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "hyperliquid-spot-order",
    "params": {
      "coin": "ETH",
      "size": "0.01",
      "price": "1000",
      "side": "buy",
      "orderType": "limit"
    },
    "network": "hyperliquid-testnet"
  }'
```
**Expected**: 200 OK, 주문 ID가 반환된다
**Check**: `orderId` 또는 관련 응답 필드 기록. 가격을 시장가 대비 충분히 낮게 설정하여 체결 방지

### Step 3: Spot 주문 확인
**Action**: 생성된 Spot 주문이 open orders에 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/hyperliquid/orders?type=spot \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, open orders 목록에 Step 2의 주문이 포함된다
**Check**: ETH buy limit order at $1000이 목록에 존재

### Step 4: Spot 주문 취소
**Action**: 생성한 Spot 주문을 취소한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "hyperliquid-spot-cancel",
    "params": {
      "coin": "ETH",
      "orderId": "<SPOT_ORDER_ID>"
    },
    "network": "hyperliquid-testnet"
  }'
```
**Expected**: 200 OK, 주문 취소 성공
**Check**: 취소 확인 응답

### Step 5: Perp 리밋 주문 생성
**Action**: ETH Perp 리밋 매수 주문을 레버리지 2x로 생성한다 (체결되지 않을 낮은 가격).
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "hyperliquid-perp-order",
    "params": {
      "coin": "ETH",
      "size": "0.01",
      "price": "1000",
      "side": "buy",
      "orderType": "limit",
      "leverage": 2
    },
    "network": "hyperliquid-testnet"
  }'
```
**Expected**: 200 OK, Perp 주문 ID가 반환된다
**Check**: `orderId` 기록

### Step 6: Perp 주문 확인 및 취소
**Action**: Perp 주문을 확인한 후 취소한다.
```bash
# 주문 확인
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/hyperliquid/orders?type=perp \
  -H 'Authorization: Bearer <session-token>'

# 주문 취소
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "hyperliquid-perp-cancel",
    "params": {
      "coin": "ETH",
      "orderId": "<PERP_ORDER_ID>"
    },
    "network": "hyperliquid-testnet"
  }'
```
**Expected**: 주문이 목록에 존재하고, 취소가 성공한다
**Check**: Perp open orders에서 주문 확인 후 취소 응답 확인

### Step 7: 최종 잔액 확인
**Action**: 모든 주문 취소 후 잔액이 원래와 동일한지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=hyperliquid-testnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 Step 1과 동일 (주문 취소했으므로 변동 없음)
**Check**: USDC 잔액이 Step 1과 동일한지 확인

## Verification
- [ ] Hyperliquid testnet 잔액 조회 성공
- [ ] Spot 리밋 주문 생성 성공 (orderId 반환)
- [ ] Spot 주문이 open orders에 표시됨
- [ ] Spot 주문 취소 성공
- [ ] Perp 리밋 주문 생성 성공 (레버리지 2x)
- [ ] Perp 주문 확인 및 취소 성공
- [ ] 최종 잔액이 초기 잔액과 동일

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Spot order + cancel | hyperliquid-testnet | N/A | ~$0 |
| Perp order + cancel | hyperliquid-testnet | N/A | ~$0 |
| **Total** | | | **~$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Hyperliquid not configured | testnet 모드 미활성화 | Admin Settings에서 `hyperliquid_testnet=true` 설정 |
| Insufficient balance | Drip faucet 미사용 | https://app.hyperliquid-testnet.xyz/drip 에서 자금 요청 |
| Order immediately filled | 가격이 시장가에 근접 | 가격을 현재 시장가의 50% 이하로 설정 |
| Rate limit exceeded | API 요청 빈도 초과 | 요청 간 2초 간격 유지 |
| Invalid coin | 지원하지 않는 코인 심볼 | Hyperliquid testnet 지원 코인 목록 확인 |
