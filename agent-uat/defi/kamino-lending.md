---
id: "defi-08"
title: "Kamino Lending (USDC Supply)"
category: "defi"
auth: "session"
network: ["solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "medium"
tags: ["defi", "lending", "kamino", "solana", "supply"]
---

# Kamino Lending (USDC Supply)

## Metadata
- **ID**: defi-08
- **Category**: defi
- **Network**: solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: medium -- 실제 메인넷 USDC를 Kamino에 공급, 프로토콜 리스크 존재

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Solana Mainnet 지갑 보유
- [ ] SOL 보유 (tx fee, 최소 0.01 SOL)
- [ ] USDC 보유 (최소 1 USDC, mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)

## Scenario Steps

### Step 1: USDC 토큰 잔액 조회
**Action**: Solana Mainnet에서 USDC 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 목록에 USDC 잔액이 포함된다
**Check**: USDC 잔액이 1.0 이상인지 확인

### Step 2: Kamino 마켓 정보 확인
**Action**: Kamino USDC reserve의 현재 supply APY를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=kamino&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Kamino 마켓 정보 또는 기존 포지션이 반환된다
**Check**: supply APY, 기존 포지션 유무 확인

### Step 3: Kamino USDC Supply Simulate
**Action**: USDC 1.0을 Kamino에 공급하는 simulate을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/actions/kamino/kamino_supply?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 예상 kToken 수령량과 tx fee가 반환된다
**Check**: `outputAmount`, `estimatedFee` 확인

### Step 4: 사용자 승인 후 실제 Supply 실행
**Action**: 사용자에게 supply 조건을 표시하고 승인 후 실행한다.
- Supply: 1.0 USDC -> Kamino USDC reserve
- 예상 수령: {outputAmount} kUSDC
- tx fee: ~0.000005 SOL

```bash
curl -s -X POST http://localhost:3100/v1/actions/kamino/kamino_supply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx signature가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: Kamino 포지션 확인
**Action**: Supply 후 Kamino 포지션이 생성되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/positions?walletId=<WALLET_ID>&protocol=kamino&network=solana-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, USDC supply 포지션이 표시된다
**Check**: supply 금액이 ~1.0 USDC로 표시되는지 확인

### Step 7: (선택) Withdraw Simulate
**Action**: Kamino에서 USDC를 인출하는 simulate을 확인한다. 실제 실행은 사용자 선택.
```bash
curl -s -X POST http://localhost:3100/v1/actions/kamino/kamino_withdraw?dryRun=true \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "humanAmount": "1.0",
      "decimals": 6
    }
  }'
```
**Expected**: 200 OK, 예상 USDC 반환량이 표시된다
**Check**: 실제 실행 여부는 사용자에게 확인

## Verification
- [ ] USDC 잔액 조회 성공 (200 응답)
- [ ] Kamino 마켓 정보 확인 (supply APY)
- [ ] Supply simulate 성공 (예상 kToken 수령량 반환)
- [ ] 사용자 승인 완료
- [ ] 실제 supply 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] Kamino 포지션에 USDC supply가 표시됨

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Kamino supply tx fee | solana-mainnet | ~5,000 lamports | ~$0.001 |
| Priority fee | solana-mainnet | variable | ~$0.005 |
| **Total** | | | **~$0.01** |

> **Note**: 1.0 USDC가 Kamino reserve에 공급된다. Supply된 USDC는 이자를 누적하며 withdraw로 회수 가능하다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Asset not found | Kamino asset 식별자 오류 | `asset` 파라미터에 SPL 토큰 mint 주소 사용 (예: USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) |
| Insufficient USDC | USDC 잔액 부족 | 최소 1 USDC 확보 필요 |
| Kamino program error | 프로그램 업그레이드/점검 | Kamino 상태 확인 후 재시도 |
| kToken not showing | 토큰 계정 미생성 | 첫 supply 시 자동 생성됨, 잔액 조회 재시도 |
| Position not updated | 인덱싱 지연 | 몇 초 후 포지션 조회 재시도 |
