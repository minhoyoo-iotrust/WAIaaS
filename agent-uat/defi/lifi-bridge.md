---
id: "defi-03"
title: "LI.FI Cross-Chain Bridge (L1 -> L2)"
category: "defi"
network: ["ethereum-mainnet", "arbitrum-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "bridge", "lifi", "crosschain", "l1-to-l2"]
---

# LI.FI Cross-Chain Bridge (L1 -> L2)

## Metadata
- **ID**: defi-03
- **Category**: defi
- **Network**: ethereum-mainnet, arbitrum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 크로스체인 브릿지, 완료까지 시간 소요, 브릿지 리스크 존재

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (브릿지 금액 + 가스비, 최소 0.01 ETH)
- [ ] Arbitrum Mainnet 지갑 보유 (수신 지갑, 동일 주소 권장)

## Scenario Steps

### Step 1: 출발 체인 잔액 조회
**Action**: Ethereum Mainnet에서 ETH 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: ETH 잔액이 0.01 이상인지 확인

### Step 2: LI.FI 브릿지 Dry-Run
**Action**: Ethereum -> Arbitrum ETH 브릿지를 dry-run으로 실행하여 예상 수령량, 브릿지 경로, 가스비를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "lifi-bridge",
    "params": {
      "fromChain": "ethereum-mainnet",
      "toChain": "arbitrum-mainnet",
      "fromToken": "ETH",
      "toToken": "ETH",
      "amount": "0.005",
      "toAddress": "<MY_ARBITRUM_ADDRESS>"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 브릿지 경로, 예상 수령량, 예상 소요 시간, 가스비가 반환된다
**Check**: `outputAmount`(예상 ETH 수령), `route`(브릿지 경로), `estimatedTime`(소요 시간), `estimatedGas` 확인

### Step 3: 사용자 승인
**Action**: 브릿지 경로, 예상 수령량, 소요 시간, 가스비를 사용자에게 표시하고 승인을 요청한다.
- 브릿지: 0.005 ETH (Ethereum) -> {outputAmount} ETH (Arbitrum)
- 경로: {route}
- 예상 소요 시간: {estimatedTime} (일반적으로 2-15분)
- L1 가스비: ~${gasCostUsd}
- 브릿지 수수료: ~0.1-0.5%

**Check**: 사용자가 브릿지 조건을 확인하고 승인

### Step 4: 실제 브릿지 실행
**Action**: 사용자 승인 후 실제 브릿지를 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "lifi-bridge",
    "params": {
      "fromChain": "ethereum-mainnet",
      "toChain": "arbitrum-mainnet",
      "fromToken": "ETH",
      "toToken": "ETH",
      "amount": "0.005",
      "toAddress": "<MY_ARBITRUM_ADDRESS>"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 출발 체인 트랜잭션 확인
**Action**: 출발 체인(Ethereum)에서 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed`로 전환된다
**Check**: 출발 체인 tx 컨펌 확인. 이 시점에서 브릿지 전송이 시작됨

### Step 6: 브릿지 상태 추적
**Action**: 브릿지 전송 진행 상황을 추적한다. 30초 간격으로 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 브릿지 상태가 PENDING -> SENDING -> DONE으로 진행된다
**Check**: 상태 전환을 확인하며 사용자에게 진행 상황 안내. 일반적으로 2-15분 소요

### Step 7: 도착 체인 잔액 확인
**Action**: 브릿지 완료 후 Arbitrum Mainnet에서 ETH 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=arbitrum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: Arbitrum ETH 잔액이 ~0.005 ETH (수수료 차감) 증가
**Check**: 브릿지 전 대비 ETH 잔액 증가 확인

## Verification
- [ ] 출발 체인 ETH 잔액 조회 성공 (200 응답)
- [ ] LI.FI 브릿지 dry-run 성공 (경로, 예상 수령량, 소요 시간 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 브릿지 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 출발 체인 tx 컨펌 완료
- [ ] 브릿지 상태 추적 성공 (PENDING -> DONE)
- [ ] 도착 체인 ETH 잔액 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| LI.FI bridge tx | ethereum-mainnet | ~200,000 | ~$3-5 |
| Bridge fee | - | - | ~0.1-0.5% |
| **Total** | | | **~$5.00** |

> **Note**: 브릿지 완료까지 2-15분이 소요된다. 출발 체인 tx 컨펌 후 도착 체인에서 자금이 수령될 때까지 기다려야 한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Bridge route not available | 해당 경로 미지원 | 다른 토큰 쌍 또는 다른 도착 체인 시도 |
| Gas price spike on L1 | Ethereum 네트워크 혼잡 | 혼잡 완화 후 재시도 |
| Bridge timeout | 10분 이상 대기 | 브릿지 상태 계속 확인, LI.FI explorer에서 tx 조회 |
| Destination token different | 도착 토큰이 예상과 다름 | dry-run에서 toToken 확인, 경로 재설정 |
| Insufficient ETH | ETH 잔액 부족 | 최소 0.01 ETH 확보 (브릿지 + 가스) |
