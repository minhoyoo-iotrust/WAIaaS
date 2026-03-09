---
id: "mainnet-05"
title: "L2 네이티브 전송"
category: "mainnet"
network: ["polygon-mainnet", "arbitrum-mainnet", "base-mainnet"]
requires_funds: true
estimated_cost_usd: "0.05"
risk_level: "medium"
tags: ["transfer", "l2", "polygon", "arbitrum", "base", "native", "mainnet"]
---

# L2 네이티브 전송

## Metadata
- **ID**: mainnet-05
- **Category**: mainnet
- **Network**: polygon-mainnet, arbitrum-mainnet, base-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01-0.05 per L2
- **Risk Level**: medium -- 실제 메인넷 자금 사용, 다만 L2 가스비는 L1보다 매우 저렴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] L2 네트워크 중 하나 이상에 지갑 보유 (Polygon, Arbitrum, Base)
- [ ] 각 L2 네이티브 토큰 보유:
  - Polygon: POL (최소 0.01 POL)
  - Arbitrum: ETH (최소 0.0001 ETH)
  - Base: ETH (최소 0.0001 ETH)

## Scenario Steps

### Step 1: 사용 가능한 L2 지갑 확인
**Action**: connect-info에서 사용 가능한 네트워크별 지갑을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 목록이 반환된다
**Check**: polygon-mainnet, arbitrum-mainnet, base-mainnet 중 사용 가능한 L2 지갑 확인. 최소 1개 이상 필요

### Step 2: Polygon 자기 전송 (사용 가능한 경우)
**Action**: Polygon Mainnet에서 자기 주소로 0.001 POL을 전송한다.
```bash
# Dry-run
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<POLYGON_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_POLYGON_ADDRESS>",
    "value": "0.001",
    "network": "polygon-mainnet"
  }'

# 실제 전송 (dry-run 확인 후)
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<POLYGON_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_POLYGON_ADDRESS>",
    "value": "0.001",
    "network": "polygon-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 성공
**Check**: `txId`, `txHash` 기록. Polygon은 ~2초 블록타임으로 빠르게 컨펌

### Step 3: Arbitrum 자기 전송 (선택적)
**Action**: Arbitrum Mainnet에서 자기 주소로 0.0001 ETH를 전송한다.
```bash
# Dry-run
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<ARBITRUM_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ARBITRUM_ADDRESS>",
    "value": "0.0001",
    "network": "arbitrum-mainnet"
  }'

# 실제 전송 (dry-run 확인 후)
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<ARBITRUM_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_ARBITRUM_ADDRESS>",
    "value": "0.0001",
    "network": "arbitrum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 성공
**Check**: Arbitrum은 ~0.25초 블록타임으로 거의 즉시 컨펌

### Step 4: Base 자기 전송 (선택적)
**Action**: Base Mainnet에서 자기 주소로 0.0001 ETH를 전송한다.
```bash
# Dry-run
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<BASE_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_BASE_ADDRESS>",
    "value": "0.0001",
    "network": "base-mainnet"
  }'

# 실제 전송 (dry-run 확인 후)
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<BASE_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_BASE_ADDRESS>",
    "value": "0.0001",
    "network": "base-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 성공
**Check**: Base는 ~2초 블록타임

### Step 5: 각 L2 잔액 재확인
**Action**: 사용한 각 L2 네트워크의 잔액을 재확인한다.
```bash
# 사용한 L2별로 반복
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=<L2_NETWORK> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 각 L2에서 가스비만큼만 감소 (자기 전송)
**Check**: 각 L2 잔액 감소분이 가스비 범위 이내. L2 가스비는 일반적으로 $0.01 미만

## Verification
- [ ] 최소 1개 L2 네트워크에서 지갑 확인
- [ ] Dry-run 성공 (L2 가스비 확인)
- [ ] 자기 전송 트랜잭션 생성 성공 (각 L2)
- [ ] 트랜잭션 컨펌 완료 (L2는 빠른 컨펌)
- [ ] 잔액 감소분이 가스비 이내 (L2 가스비는 매우 저렴)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| POL self-transfer | polygon-mainnet | ~21,000 | ~$0.01 |
| ETH self-transfer | arbitrum-mainnet | ~21,000 | ~$0.01 |
| ETH self-transfer | base-mainnet | ~21,000 | ~$0.01 |
| **Total (all 3)** | | | **~$0.03-0.05** |

> **Note**: L2 가스비는 L1 Ethereum보다 10-100배 저렴하다. 단, L1 data posting 비용에 따라 변동 가능.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| No L2 wallet available | L2 네트워크 지갑 미생성 | EVM 지갑을 생성하면 모든 EVM L2에서 동일 주소 사용 가능 |
| Insufficient funds on L2 | L2 네이티브 토큰 부족 | 브릿지를 통해 L1에서 L2로 자금 이동 또는 L2에서 직접 구매 |
| Network not supported | 데몬에서 해당 L2 미지원 | config.toml에서 L2 RPC 엔드포인트 설정 확인 |
| L2 sequencer down | L2 시퀀서 일시 중단 | 해당 L2 상태 페이지 확인 후 복구 대기 |
