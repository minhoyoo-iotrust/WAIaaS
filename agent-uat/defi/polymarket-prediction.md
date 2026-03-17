---
id: "defi-13"
title: "Polymarket 예측 시장 주문"
category: "defi"
auth: "session"
network: ["polygon-mainnet"]
requires_funds: true
estimated_cost_usd: "1.00"
risk_level: "medium"
tags: ["defi", "prediction", "polymarket", "clob", "order"]
---

# Polymarket 예측 시장 주문

## Metadata
- **ID**: defi-13
- **Category**: defi
- **Network**: polygon-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$1.00 (USDC 주문 + gas)
- **Risk Level**: medium -- 실제 Polymarket CLOB 주문, 체결 방지를 위해 매우 낮은 가격(0.01) 사용

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Polygon 네트워크 EVM 지갑 보유
- [ ] Polygon USDC 보유 (최소 5 USDC)
- [ ] Admin Settings에서 `polymarket_enabled=true` 설정 완료
- [ ] Polymarket API Key 생성 완료 (`POST /v1/polymarket/setup`)

## Scenario Steps

### Step 1: Polymarket 설정 확인
**Action**: Admin Settings에서 Polymarket 관련 설정이 활성화 상태인지 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, `polymarket_enabled=true` 확인
**Check**: polymarket 관련 설정(`polymarket_enabled`, `polymarket_fee_bps`, `polymarket_auto_approve_ctf`)이 활성화 상태

### Step 2: API Key 생성 (또는 확인)
**Action**: Polymarket CLOB API Key를 생성하거나 기존 키를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/polymarket/setup \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{ "walletId": "<WALLET_ID>" }'
```
**Expected**: 200/201, API Key 생성 또는 이미 존재
**Check**: `apiKey` 필드가 반환되는지 확인

### Step 3: 활성 마켓 탐색
**Action**: Gamma API를 통해 활성 마켓 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/polymarket/markets?limit=5 \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 활성 마켓 목록
**Check**: `conditionId`, `question`, `outcomes`, `prices` 필드 확인. 주문할 마켓의 `conditionId`를 기록

### Step 4: 마켓 상세 조회
**Action**: 선택한 마켓의 상세 정보를 조회한다.
```bash
curl -s http://localhost:3100/v1/polymarket/markets/<conditionId> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 선택한 마켓 상세 정보
**Check**: `outcomes`, `currentPrices`, `volume` 등 확인

### Step 5: USDC 잔액 확인
**Action**: Polymarket 관련 USDC 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/polymarket/balance?walletId=<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, USDC 잔액 반환
**Check**: balance >= 5 USDC

### Step 6: 리밋 매수 주문 생성
**Action**: 체결 방지용 매우 낮은 가격(0.01)으로 리밋 매수 주문을 생성한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/buy \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "conditionId": "<CONDITION_ID>",
    "outcomeIndex": 0,
    "side": "buy",
    "size": "1",
    "price": "0.01"
  }'
```
**Expected**: 201 OK, `orderId` 반환 (ApiDirectResult 패턴)
**Check**: `orderId` 기록. price=0.01은 체결되지 않음 (실제 Yes 토큰 가격이 0.01 이하가 아닌 한)

### Step 7: 주문 확인 + 취소
**Action**: 생성된 주문을 확인하고 취소한다.
```bash
# 주문 확인
curl -s http://localhost:3100/v1/polymarket/orders?walletId=<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'

# 주문 취소
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/cancel \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "orderId": "<ORDER_ID>"
  }'
```
**Expected**: 201, 주문 취소 확인
**Check**: 주문이 canceled 상태로 변경

### Step 8: 포지션 + PnL 확인
**Action**: 포지션과 PnL 정보를 조회한다.
```bash
# 포지션 조회
curl -s http://localhost:3100/v1/polymarket/positions?walletId=<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'

# PnL 조회
curl -s http://localhost:3100/v1/polymarket/pnl?walletId=<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK (빈 배열도 OK -- 체결된 주문이 없으므로)
**Check**: API 정상 응답 확인

### Step 9: 아웃컴 토큰 매도 (optional — 포지션 보유 시)
**Action**: 체결된 주문이 있어 아웃컴 토큰을 보유 중이라면, 해당 토큰을 시장가 매도하여 포지션을 정리한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/sell \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "conditionId": "<CONDITION_ID>",
    "outcomeIndex": 0,
    "side": "sell",
    "size": "<POSITION_SIZE>",
    "price": "0.99"
  }'
```
**Expected**: 201 OK, 매도 주문이 CLOB에 제출됨
**Check**: `orderId` 반환, 포지션이 감소 또는 0으로 전환

> **Note**: 매도 가격은 현재 시장가보다 낮게 설정해야 즉시 체결된다. 포지션이 없으면 이 스텝을 건너뛴다. 마켓 결과 확정 후에는 `polymarket_redeem` 액션으로 정산도 가능하다.

## Verification
- [ ] Admin Settings에서 Polymarket 활성화 확인됨
- [ ] API Key 생성/조회 정상 동작
- [ ] 마켓 목록 + 상세 조회 정상 반환
- [ ] 리밋 매수 주문이 CLOB에 제출됨 (ApiDirectResult 패턴)
- [ ] 주문 조회 + 취소 정상 동작
- [ ] 포지션/PnL 조회 API 정상 응답
- [ ] (optional) 아웃컴 토큰 매도로 포지션 정리 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| USDC approve (if first time) | polygon-mainnet | ~0.01 MATIC | ~$0.01 |
| Limit buy order (0.01 price) | off-chain CLOB | 0 gas | ~$0 |
| Order cancel | off-chain CLOB | 0 gas | ~$0 |
| **Total** | | | **~$0.01 gas + $0 order** |

> **Note**: 실제 USDC가 에스크로되지 않음 (price=0.01로 체결 안됨). 메인넷 USDC 최소 5 USDC 보유 권장.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 403 "CLOB rejected" | EOA signatureType=0 미지원 | Polymarket이 EOA 직접 서명을 거부하는 경우, proxy wallet 필요 (현재 미지원) |
| 400 "API Key not found" | 지갑별 API Key 미생성 | POST /v1/polymarket/setup 먼저 실행 |
| 400 "Polymarket disabled" | Admin Settings 미활성화 | polymarket_enabled=true 설정 |
| 500 "Gamma API error" | Gamma API 일시 장애 | 잠시 후 재시도 |

## Cleanup
- 주문을 Step 7에서 취소하므로 별도 cleanup 불필요
- 체결된 주문이 있다면 포지션이 남으므로 추후 매도 또는 리딤 필요
