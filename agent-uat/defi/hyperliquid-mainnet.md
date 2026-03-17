---
id: "defi-11"
title: "Hyperliquid Mainnet Perp/Spot"
category: "defi"
auth: "session"
network: ["hyperliquid-mainnet"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "medium"
tags: ["defi", "perp", "spot", "hyperliquid", "order"]
---

# Hyperliquid Mainnet Perp/Spot

## Metadata
- **ID**: defi-11
- **Category**: defi
- **Network**: hyperliquid-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0
- **Risk Level**: medium -- 실제 메인넷 Hyperliquid 주문, 체결 방지를 위해 시장가 대비 충분히 낮은 가격 사용

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Hyperliquid mainnet 연결 EVM 지갑 보유
- [ ] USDC 보유 (최소 10 USDC on Hyperliquid)
- [ ] Admin Settings에서 `hyperliquid_testnet=false` (mainnet 모드)

## Scenario Steps

### Step 1: Hyperliquid 잔액 확인
**Action**: Hyperliquid mainnet 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=hyperliquid-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Hyperliquid mainnet 잔액이 반환된다
**Check**: USDC 잔액이 10 이상인지 확인

### Step 2: Spot 리밋 매수 주문 생성
**Action**: ETH Spot 리밋 매수 주문을 생성한다. **체결 방지를 위해 시장가 대비 30% 이하 가격($1000)으로 설정한다.**
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
    "network": "hyperliquid-mainnet"
  }'
```
**Expected**: 200 OK, 주문 ID가 반환된다
**Check**: `orderId` 기록. 가격 $1000은 현재 ETH 시장가($3000+) 대비 충분히 낮아 체결되지 않음

### Step 3: Spot 주문 확인
**Action**: 생성된 Spot 주문이 open orders에 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/hyperliquid/orders?type=spot \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, open orders 목록에 ETH buy limit order가 포함된다
**Check**: ETH buy limit $1000 주문이 open 상태로 표시

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
    "network": "hyperliquid-mainnet"
  }'
```
**Expected**: 200 OK, 주문 취소 성공
**Check**: 취소 확인 응답

### Step 5: Perp 리밋 매수 주문 생성
**Action**: ETH-PERP 리밋 매수 주문을 레버리지 2x로 생성한다. **체결 방지를 위해 $1000으로 설정.**
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
    "network": "hyperliquid-mainnet"
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
    "network": "hyperliquid-mainnet"
  }'
```
**Expected**: 주문이 목록에 존재하고, 취소가 성공한다
**Check**: Perp open orders에서 주문 확인 후 취소 응답 확인

### Step 7: Perp 포지션 오픈 (optional — 체결되는 가격으로)
**Action**: 소량 ETH-PERP 시장가 매수 주문으로 실제 포지션을 오픈한다.
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
      "size": "0.001",
      "side": "buy",
      "orderType": "market",
      "leverage": 2
    },
    "network": "hyperliquid-mainnet"
  }'
```
**Expected**: 200 OK, 시장가 주문이 즉시 체결되어 Long 포지션이 오픈된다
**Check**: `orderId` 기록, 포지션 확인

### Step 8: Perp 포지션 클로즈 (optional)
**Action**: 반대 방향 시장가 매도 주문으로 포지션을 청산한다.
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
      "size": "0.001",
      "side": "sell",
      "orderType": "market",
      "leverage": 2,
      "reduceOnly": true
    },
    "network": "hyperliquid-mainnet"
  }'
```
**Expected**: 200 OK, 포지션이 청산되고 PnL이 정산된다
**Check**: 포지션이 0이 되었는지 확인. reduceOnly=true로 새 포지션이 열리지 않음

### Step 9: 최종 잔액 확인
**Action**: 모든 주문 취소/포지션 청산 후 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=hyperliquid-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 잔액이 Step 1과 유사 (Step 7-8 실행 시 소액 PnL 변동 가능)
**Check**: USDC 잔액 확인

## Verification
- [ ] Hyperliquid mainnet 잔액 조회 성공
- [ ] Spot 리밋 주문 생성 성공 (orderId 반환, 체결 방지 가격)
- [ ] Spot 주문이 open orders에 표시됨
- [ ] Spot 주문 취소 성공
- [ ] Perp 리밋 주문 생성 성공 (레버리지 2x, 체결 방지 가격)
- [ ] Perp 주문 확인 및 취소 성공
- [ ] (optional) Perp 시장가 매수로 포지션 오픈 성공
- [ ] (optional) 반대 매매 시장가 매도로 포지션 클로즈 성공 (reduceOnly)
- [ ] 최종 잔액 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Spot order + cancel | hyperliquid-mainnet | N/A (EIP-712 sign) | ~$0 |
| Perp order + cancel | hyperliquid-mainnet | N/A (EIP-712 sign) | ~$0 |
| **Total** | | | **~$0** |

> **Note**: Hyperliquid는 자체 gas fee가 없으며 EIP-712 서명만으로 주문을 생성/취소한다. 주문은 모두 취소하므로 자금 변동이 없다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Hyperliquid not configured | mainnet 모드 미설정 | Admin Settings에서 `hyperliquid_testnet=false` 설정 |
| Insufficient balance | USDC 잔액 부족 | 최소 10 USDC on Hyperliquid 확보 |
| Order immediately filled | 가격이 시장가에 근접 | 가격을 현재 시장가의 30% 이하로 설정 ($1000 권장) |
| Rate limit exceeded | API 요청 빈도 초과 | 요청 간 2초 간격 유지 |
| Invalid coin | 지원하지 않는 코인 심볼 | Hyperliquid mainnet 지원 코인 목록 확인 |
