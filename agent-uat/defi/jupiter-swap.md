---
id: "defi-01"
title: "Jupiter Swap (SOL -> USDC)"
category: "defi"
auth: "session"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "medium"
tags: ["defi", "swap", "jupiter", "solana", "dex"]
---

# Jupiter Swap (SOL -> USDC)

## Metadata
- **ID**: defi-01
- **Category**: defi
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: medium -- 실제 메인넷 토큰 스왑, 슬리피지에 의한 미세 손실 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (최소 0.01 SOL -- 스왑 금액 + tx fee)

## Scenario Steps

### Step 1: SOL 잔액 조회
**Action**: Solana Mainnet에서 지갑의 SOL 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, SOL 잔액이 반환된다
**Check**: SOL 잔액이 0.01 이상인지 확인

### Step 2: Jupiter 스왑 Simulate
**Action**: SOL -> USDC 스왑을 simulate으로 실행하여 예상 수령량과 가스비를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter_swap/swap?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "5000000",
      "slippageBps": 50
    }
  }'
```
**Expected**: 200 OK, 예상 USDC 수령량, 스왑 경로, 가스비가 반환된다
**Check**: `outputAmount`(예상 USDC), `route`(스왑 경로), `estimatedFee` 확인. 가스비가 $0.05를 초과하면 사용자에게 경고

### Step 3: 사용자 승인
**Action**: 스왑 비율 및 예상 수령량을 사용자에게 표시하고 승인을 요청한다.
- 스왑: 0.005 SOL -> {outputAmount} USDC
- 스왑 경로: {route}
- 슬리피지 허용: 0.5% (50 bps)
- 예상 tx fee: ~0.000005 SOL

**Check**: 사용자가 스왑 조건을 확인하고 승인

### Step 4: 실제 스왑 실행
**Action**: 사용자 승인 후 실제 Jupiter 스왑을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "5000000",
      "slippageBps": 50
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx signature가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인. Solana는 ~400ms 블록타임으로 수 초 내 컨펌 기대

### Step 6: 잔액 재확인
**Action**: 스왑 후 잔액을 재조회하여 SOL 감소, USDC 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: SOL 잔액이 ~0.005 SOL + tx fee만큼 감소, USDC 잔액이 증가
**Check**: SOL 감소분 확인, USDC 토큰 잔액이 simulate 예상치와 유사한지 확인

## Verification
- [ ] SOL 잔액 조회 성공 (200 응답)
- [ ] Jupiter 스왑 simulate 성공 (예상 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스왑 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스왑 후 SOL 감소, USDC 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Jupiter swap tx fee | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Priority fee | solana-mainnet | variable | ~$0.005 |
| **Total** | | | **~$0.01** |

> **Note**: Jupiter 스왑 실행 시 0.005 SOL이 USDC로 변환된다. 가스비 외에 스왑 금액만큼 SOL이 감소하고 USDC가 증가한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Slippage exceeded | 스왑 중 가격 변동 | `slippageBps`를 100 (1%)으로 증가 후 재시도 |
| Insufficient SOL | SOL 잔액 부족 | 최소 0.01 SOL 확보 필요 |
| Route not found | Jupiter에서 경로 미발견 | 유동성 부족, 다른 토큰 쌍으로 시도 또는 잠시 후 재시도 |
| Transaction simulation failed | 프로그램 오류 | 최신 Jupiter 라우트로 재시도 (amount 조정) |
| Priority fee too high | 네트워크 혼잡 | priority fee 설정 조정 또는 혼잡 완화 후 재시도 |
