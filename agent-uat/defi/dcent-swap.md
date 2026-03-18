---
id: "defi-12"
title: "DCent Swap Aggregator"
category: "defi"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "5.00"
risk_level: "medium"
tags: ["defi", "swap", "dcent", "aggregator", "evm"]
---

# DCent Swap Aggregator

## Metadata
- **ID**: defi-12
- **Category**: defi
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$5.00
- **Risk Level**: medium -- 실제 메인넷 토큰 스왑, 가스비 변동 가능

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (스왑 금액 + 가스비, 최소 0.005 ETH)

## Scenario Steps

### Step 1: 잔액 조회
**Action**: Ethereum Mainnet에서 ETH/토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, ETH 잔액이 반환된다
**Check**: ETH 잔액이 0.005 이상인지 확인

### Step 2: DCent 스왑 Simulate
**Action**: DCent aggregator를 통해 ETH -> USDC 스왑을 simulate으로 실행하여 최적 경로와 예상 수령량을 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "dcent-swap",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "0.001",
      "slippageBps": 50
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, DCent aggregator가 찾은 최적 경로, 예상 USDC 수령량, 가스비가 반환된다
**Check**: `outputAmount`(예상 USDC), `route`(최적 경로), `estimatedGas` 확인

### Step 3: 사용자 승인
**Action**: 스왑 경로, 예상 수령량, 가스비를 사용자에게 표시하고 승인을 요청한다.
- 스왑: 0.001 ETH -> {outputAmount} USDC
- 경로: {route} (DCent aggregator 최적 경로)
- 슬리피지 허용: 0.5% (50 bps)
- 예상 가스비: ~${gasCostUsd}

**Check**: 사용자가 스왑 조건을 확인하고 승인

### Step 4: 실제 스왑 실행
**Action**: 사용자 승인 후 실제 DCent 스왑을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "dcent-swap",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "0.001",
      "slippageBps": 50
    },
    "network": "ethereum-mainnet"
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
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: 잔액 재확인
**Action**: 스왑 후 잔액을 재조회하여 ETH 감소, USDC 증가를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: ETH 잔액이 0.001 ETH + 가스비만큼 감소, USDC 토큰 잔액이 증가
**Check**: ETH 감소분 확인, USDC 잔액이 simulate 예상치와 유사한지 확인

## Verification
- [ ] ETH 잔액 조회 성공 (200 응답)
- [ ] DCent 스왑 simulate 성공 (최적 경로, 예상 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 스왑 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 스왑 후 ETH 감소, USDC 증가 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| USDC approve (첫 스왑) | ethereum-mainnet | ~46,000 | ~$1-2 |
| DCent swap | ethereum-mainnet | ~200,000 | ~$3-5 |
| **Total** | | | **~$5.00** |

> **Note**: DCent aggregator는 여러 DEX의 유동성을 비교하여 최적 경로를 찾는다. 0x와 유사하지만 DCent 자체 라우팅 엔진을 사용한다.

---

## Additional Scenarios

### Scenario A: 2-hop Auto-Routing (defi-12a)

직접 경로가 없는 마이너 토큰 스왑 시 중간 토큰(ETH/USDC/USDT)을 경유하는 2-hop 자동 라우팅을 검증한다.

#### Prerequisites
- 위 Prerequisites와 동일

#### Step A1: 2-hop 경로 탐색
**Action**: 직접 경로가 없는 토큰 쌍에 대해 2-hop 견적을 조회한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "dcent-swap",
    "params": {
      "fromAsset": "eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "toAsset": "eip155:1/erc20:0x514910771AF9Ca656af840dff83E8264EcF986CA",
      "amount": "10",
      "slippageBps": 100
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 2-hop 경로(DAI→ETH→LINK 등)가 반환된다
**Check**: `route`에 중간 토큰이 포함되는지 확인. 직접 경로가 있으면 직접 경로가 우선 선택될 수 있음

#### Step A2: 견적 비교 (queryQuotes)
**Action**: MCP/SDK를 통해 복수 프로바이더 견적을 직접 조회한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/dcent_swap/query_quotes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "fromAsset": "eip155:1/slip44:60",
    "toAsset": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amount": "0.001"
  }'
```
**Expected**: 200 OK, 복수 프로바이더(0x, LiFi, ButterSwap 등) 견적이 반환된다
**Check**: 각 프로바이더의 `outputAmount`, `status` 확인. bestOrder가 최적 경로로 정렬

#### Verification (2-hop)
- [ ] 2-hop 경로 탐색 시 중간 토큰 경유 경로가 표시됨
- [ ] 복수 프로바이더 견적이 반환되고 bestOrder로 정렬됨

---

### Scenario B: 크로스체인 스왑 (defi-12b)

EVM ↔ Solana 크로스체인 스왑을 검증한다.

#### Prerequisites
- Ethereum Mainnet + Solana Mainnet 지갑 보유
- ETH + SOL 보유

#### Step B1: EVM → Solana 크로스체인 Simulate
**Action**: Ethereum ETH를 Solana USDC로 크로스체인 스왑을 simulate한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "dcent-swap",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "0.001",
      "slippageBps": 100,
      "toWalletAddress": "<SOLANA_WALLET_ADDRESS>"
    },
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 크로스체인 경로(LiFi/ButterSwap 경유)와 예상 수령량이 반환된다
**Check**: `outputAmount`(예상 USDC), 크로스체인 프로바이더 확인

#### Verification (크로스체인)
- [ ] EVM → Solana 크로스체인 simulate 성공 (경로 + 예상 수령량 반환)

---

### Scenario C: Solana 네이티브 스왑 (defi-12c)

Solana 네트워크 내 SOL ↔ SPL 토큰 스왑을 검증한다.

#### Prerequisites
- Solana Mainnet 지갑 보유
- SOL 보유 (최소 0.01 SOL)

#### Step C1: SOL → USDC Simulate
**Action**: Solana에서 SOL → USDC 스왑을 simulate한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<SOLANA_WALLET_ID>",
    "type": "CONTRACT_CALL",
    "action": "dcent-swap",
    "params": {
      "fromAsset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
      "toAsset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "0.01",
      "slippageBps": 50
    },
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 예상 USDC 수령량과 Solana 트랜잭션 정보가 반환된다
**Check**: `outputAmount`, 프로바이더(LiFi/ButterSwap) 확인

#### Verification (Solana)
- [ ] SOL → SPL USDC simulate 성공
- [ ] Solana 네이티브 스왑 경로가 정상 반환됨

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| DCent API unavailable | DCent 서비스 장애 | 잠시 후 재시도, 서비스 상태 확인 |
| Route not found | 유동성 부족 또는 토큰 미지원 | 다른 토큰 쌍 또는 스왑 금액 조정 |
| Price impact warning | 스왑 금액 대비 유동성 부족 | 스왑 금액을 줄여 재시도 |
| Insufficient balance | ETH 잔액 부족 | 최소 0.005 ETH 확보 필요 |
| Slippage exceeded | 스왑 중 가격 변동 | `slippageBps`를 100 (1%)으로 증가 후 재시도 |
| No 2-hop route | 중간 토큰 경유 경로 없음 | 유동성이 높은 토큰 쌍으로 변경 |
| Cross-chain timeout | 브릿지 처리 지연 | 크로스체인 특성상 수 분 소요 가능, 트랜잭션 상태 확인 |
