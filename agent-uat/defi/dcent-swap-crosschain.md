---
id: "defi-15"
title: "DCent 크로스체인 스왑 (EVM→Solana)"
category: "defi"
auth: "session"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "swap", "dcent", "aggregator", "crosschain", "bridge"]
---

# DCent 크로스체인 스왑 (EVM→Solana)

## Metadata
- **ID**: defi-15
- **Category**: defi
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 메인넷 크로스체인 스왑, 브릿지 처리 지연 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] Solana Mainnet 지갑 보유
- [ ] ETH 보유 (스왑 금액 + 가스비, 최소 0.005 ETH)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: EVM 지갑의 ETH 잔액과 Solana 지갑의 USDC 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<EVM_WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<SOLANA_WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 각 지갑의 잔액이 반환된다
**Check**: ETH 잔액이 0.005 이상인지 확인. Solana USDC 잔액 기록 (스왑 후 비교용)

### Step 2: 크로스체인 스왑 Simulate (dryRun)
**Action**: Ethereum ETH를 Solana USDC로 크로스체인 스왑을 dryRun한다.
```bash
curl -s -X POST 'http://localhost:3100/v1/actions/dcent_swap/dex_swap?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000000000000",
      "slippageBps": 100,
      "fromDecimals": 18,
      "toDecimals": 6,
      "toWalletAddress": "<SOLANA_WALLET_ADDRESS>"
    }
  }'
```
**Expected**: 200 OK, 크로스체인 경로(LiFi/ButterSwap 경유)와 예상 수령량이 반환된다
**Check**: `outputAmount`(예상 USDC), 크로스체인 프로바이더 확인

### Step 3: 사용자 승인
**Action**: 크로스체인 스왑 경로, 예상 수령량, 가스비를 사용자에게 표시하고 승인을 요청한다.
- 스왑: 0.001 ETH (Ethereum) → {outputAmount} USDC (Solana)
- 크로스체인 경로: {route}
- 예상 가스비: ~${gasCostUsd}
- 예상 처리 시간: 수 분 (브릿지 경유)

**Check**: 사용자가 크로스체인 스왑 조건을 확인하고 승인

### Step 4: 실제 크로스체인 스왑 실행
**Action**: 사용자 승인 후 실제 크로스체인 스왑을 실행한다.
```bash
curl -s -X POST 'http://localhost:3100/v1/actions/dcent_swap/dex_swap' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000000000000",
      "slippageBps": 100,
      "fromDecimals": 18,
      "toDecimals": 6,
      "toWalletAddress": "<SOLANA_WALLET_ADDRESS>"
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed`로 전환된다
**Check**: `status` 필드 확인. 크로스체인은 소스 체인 tx 컨펌 후 브릿지 처리 시간 추가 소요

### Step 6: Solana USDC 잔액 확인
**Action**: 크로스체인 스왑 완료 후 Solana 지갑의 USDC 잔액을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/assets?walletId=<SOLANA_WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: USDC 잔액이 스왑 수령량만큼 증가
**Check**: USDC 증가분이 simulate 예상치와 유사한지 확인. 브릿지 특성상 수 분 지연 가능

## Verification
- [ ] EVM/Solana 잔액 조회 성공 (200 응답)
- [ ] 크로스체인 dryRun 성공 (경로 + 예상 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 크로스체인 스왑 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 소스 체인 트랜잭션 컨펌 완료
- [ ] Solana USDC 잔액 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| DCent cross-chain swap | ethereum-mainnet | ~200,000 | ~$3-5 |
| Bridge fee | — | variable | included |
| **Total** | | | **~$5.00** |

> **Note**: 크로스체인 스왑은 소스 체인에서 tx 실행 후 브릿지를 통해 대상 체인으로 자산을 전달한다. DCent API가 크로스체인 경로를 지원하지 않는 경우 dryRun에서 빈 txdata가 반환될 수 있다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| DCent API returned empty txdata | 원인 미확인 (파라미터 매핑, 소액 최소 금액 미달, 프로바이더 선택 문제 가능성) | API 요청/응답 로그 상세 확인, 금액 상향(0.005 ETH+) 재시도, DCent API 문서 대조 |
| Cross-chain timeout | 브릿지 처리 지연 | 크로스체인 특성상 수 분 소요 가능, 트랜잭션 상태 확인 |
| Solana USDC not received | 브릿지 미완료 | 수 분 후 재조회, 소스 체인 tx 확인 |
| Insufficient balance | ETH 잔액 부족 | 최소 0.005 ETH 확보 필요 |
| fromDecimals/toDecimals missing | 필수 파라미터 누락 | fromDecimals, toDecimals 추가 (#404) |
