---
id: "defi-04"
title: "Across Cross-Chain Bridge (L2 -> L2)"
category: "defi"
auth: "session"
network: ["arbitrum-mainnet", "base-mainnet"]
requires_funds: true
estimated_cost_usd: "0.50"
risk_level: "medium"
tags: ["defi", "bridge", "across", "crosschain", "l2-to-l2"]
---

# Across Cross-Chain Bridge (L2 -> L2)

## Metadata
- **ID**: defi-04
- **Category**: defi
- **Network**: arbitrum-mainnet, base-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.50
- **Risk Level**: medium -- 실제 크로스체인 브릿지, L2 간 전송으로 비교적 저렴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Arbitrum Mainnet EVM 지갑 보유
- [ ] USDC 또는 ETH 보유 (최소 1 USDC 또는 0.001 ETH on Arbitrum)
- [ ] Base Mainnet 지갑 보유 (수신 지갑, 동일 주소 권장)

## Scenario Steps

### Step 1: 출발 체인 잔액 조회
**Action**: Arbitrum Mainnet에서 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=arbitrum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, USDC/ETH 잔액이 반환된다
**Check**: USDC >= 1.0 또는 ETH >= 0.001 확인

### Step 2: Across 브릿지 Simulate
**Action**: Arbitrum -> Base USDC 브릿지를 simulate으로 실행한다. Across는 SpokePool depositV3를 사용한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "across-bridge",
    "params": {
      "fromChain": "arbitrum-mainnet",
      "toChain": "base-mainnet",
      "token": "USDC",
      "amount": "1.0",
      "toAddress": "<MY_BASE_ADDRESS>"
    },
    "network": "arbitrum-mainnet"
  }'
```
**Expected**: 200 OK, 수수료, 예상 수령량, 소요 시간이 반환된다
**Check**: `outputAmount`, `relayerFee`(릴레이어 수수료), `estimatedTime` 확인

### Step 3: 사용자 승인
**Action**: 수수료, 예상 수령량, 소요 시간을 사용자에게 표시하고 승인을 요청한다.
- 브릿지: 1.0 USDC (Arbitrum) -> {outputAmount} USDC (Base)
- 릴레이어 수수료: {relayerFee} (~0.05-0.1%)
- 예상 소요 시간: ~2-10분
- Arbitrum 가스비: ~$0.05

**Check**: 사용자가 브릿지 조건을 확인하고 승인

### Step 4: USDC Approve (필요한 경우)
**Action**: SpokePool 컨트랙트에 USDC approve를 실행한다 (첫 브릿지 시 필요).
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "APPROVE",
    "token": { "address": "<USDC_CONTRACT_ADDRESS>", "decimals": 6, "symbol": "USDC" },
    "spender": "<SPOKE_POOL_ADDRESS>",
    "amount": "1000000",
    "network": "arbitrum-mainnet"
  }'
```
**Expected**: 200 OK. 이미 approve된 경우 이 단계 생략 가능
**Check**: approve 필요 여부 확인 후 실행

### Step 5: 실제 브릿지 실행
**Action**: 사용자 승인 후 실제 Across 브릿지를 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "across-bridge",
    "params": {
      "fromChain": "arbitrum-mainnet",
      "toChain": "base-mainnet",
      "token": "USDC",
      "amount": "1.0",
      "toAddress": "<MY_BASE_ADDRESS>"
    },
    "network": "arbitrum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 6: 출발 체인 트랜잭션 확인
**Action**: Arbitrum에서 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed`로 전환된다
**Check**: 출발 체인 deposit 컨펌 확인

### Step 7: 브릿지 상태 추적
**Action**: Across 2-phase polling으로 브릿지 상태를 추적한다. 30초 간격으로 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: deposit confirmed -> fill completed (릴레이어가 도착 체인에서 자금 전달)
**Check**: 상태 전환 확인. Across는 일반적으로 2-10분 소요

### Step 8: 도착 체인 잔액 확인
**Action**: 브릿지 완료 후 Base Mainnet에서 USDC 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=base-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: Base USDC 잔액이 ~1.0 USDC (수수료 차감) 증가
**Check**: 브릿지 전 대비 USDC 잔액 증가 확인

## Verification
- [ ] 출발 체인 잔액 조회 성공 (200 응답)
- [ ] Across 브릿지 simulate 성공 (수수료, 예상 수령량, 소요 시간 반환)
- [ ] 사용자 승인 완료
- [ ] USDC approve 완료 (필요한 경우)
- [ ] 실제 브릿지 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 출발 체인 tx 컨펌 완료
- [ ] 브릿지 상태 추적 성공 (deposit -> fill completed)
- [ ] 도착 체인 USDC 잔액 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| USDC approve | arbitrum-mainnet | ~46,000 | ~$0.01 |
| Across bridge deposit | arbitrum-mainnet | ~150,000 | ~$0.05 |
| Relayer fee | - | - | ~$0.01-0.10 |
| **Total** | | | **~$0.50** |

> **Note**: L2 -> L2 브릿지는 L1 -> L2 대비 가스비가 매우 저렴하다. Across 릴레이어가 도착 체인에서 자금을 즉시 전달하고, 이후 settlement를 처리한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| SpokePool address mismatch | 네트워크별 SpokePool 주소 상이 | 정확한 Arbitrum SpokePool 주소 확인 |
| Approve needed | 첫 브릿지 시 토큰 승인 필요 | Step 4의 approve 트랜잭션 실행 |
| Bridge fill delayed | 릴레이어 지연 | 대기 (최대 30분), Across explorer에서 상태 확인 |
| Relayer fee spike | 네트워크 혼잡으로 수수료 증가 | 혼잡 완화 후 재시도 |
| Insufficient USDC | USDC 잔액 부족 | 최소 1 USDC on Arbitrum 확보 필요 |
