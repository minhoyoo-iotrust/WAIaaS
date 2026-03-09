---
id: "advanced-04"
title: "Mainnet 수신 트랜잭션 감지"
category: "advanced"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.50"
risk_level: "medium"
tags: ["incoming", "monitor", "mainnet", "detection"]
---

# Mainnet 수신 트랜잭션 감지

## Metadata
- **ID**: advanced-04
- **Category**: advanced
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.50
- **Risk Level**: medium -- 메인넷에서 실제 자산 전송, 자기 전송으로 손실 최소화

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] IncomingTxMonitor 활성화 (Admin Settings)
- [ ] ETH 보유 (Ethereum Mainnet, 최소 0.002 ETH)
- [ ] SOL 보유 (Solana Mainnet, 최소 0.01 SOL)
- [ ] 알림 채널 설정 (선택, ntfy 등)

## Scenario Steps

### Step 1: IncomingTxMonitor 상태 확인
**Action**: Admin Stats에서 IncomingTxMonitor 활성 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, IncomingTxMonitor 상태 정보가 포함된다
**Check**: 모니터가 활성 상태인지 확인. 비활성이면 Admin Settings에서 활성화 필요

### Step 2: Mainnet 지갑 주소 확인
**Action**: 세션에 연결된 Mainnet 지갑 주소를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Ethereum Mainnet 및 Solana Mainnet 지갑이 포함된다
**Check**: 각 지갑의 `id`와 `address`를 기록

### Step 3: Ethereum Mainnet 자기 전송
**Action**: ETH 자기 전송으로 수신 트랜잭션을 발생시킨다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<ETH_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ETH_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID 반환
**Check**: `txId`, `txHash` 기록

### Step 4: Ethereum 수신 트랜잭션 감지 확인
**Action**: ~15초 대기 후 수신 트랜잭션 감지 여부를 확인한다.
```bash
curl -s "http://localhost:3100/v1/wallets/<ETH_WALLET_ID>/transactions?direction=incoming" \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 방금 전송한 트랜잭션이 incoming 목록에 포함된다
**Check**: Step 3의 txHash가 incoming 트랜잭션에 포함되어 있는지 확인

### Step 5: Solana Mainnet 자기 전송
**Action**: SOL 자기 전송으로 수신 트랜잭션을 발생시킨다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<SOL_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_SOL_ADDRESS>",
    "value": "0.001",
    "network": "solana-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID 반환
**Check**: `txId`, `txHash` 기록

### Step 6: Solana 수신 트랜잭션 감지 확인
**Action**: ~5초 대기 후 수신 트랜잭션 감지 여부를 확인한다.
```bash
curl -s "http://localhost:3100/v1/wallets/<SOL_WALLET_ID>/transactions?direction=incoming" \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Solana 자기 전송 트랜잭션이 incoming 목록에 포함된다
**Check**: Step 5의 txHash가 incoming 트랜잭션에 포함되어 있는지 확인

### Step 7: 감사 로그에서 incoming_tx 이벤트 확인
**Action**: 감사 로그에서 수신 트랜잭션 감지 이벤트를 확인한다.
```bash
curl -s "http://localhost:3100/v1/admin/audit-logs?event=incoming_tx" \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, incoming_tx 이벤트가 기록되어 있다
**Check**: ETH와 SOL 수신 트랜잭션에 대한 감사 로그가 존재하는지 확인

## Verification
- [ ] IncomingTxMonitor 활성 상태 확인
- [ ] Ethereum Mainnet 자기 전송 성공
- [ ] Ethereum 수신 트랜잭션 감지 확인
- [ ] Solana Mainnet 자기 전송 성공
- [ ] Solana 수신 트랜잭션 감지 확인
- [ ] 감사 로그에 incoming_tx 이벤트 기록 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ETH self-transfer | ethereum-mainnet | ~21,000 | ~$0.50 |
| SOL self-transfer | solana-mainnet | ~5,000 lamports | ~$0.001 |
| **Total** | | | **~$0.50** |

> **Note**: 자기 전송이므로 가스비만 소비된다. ETH 전송이 비용의 대부분을 차지한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 모니터 비활성 | IncomingTxMonitor 미설정 | Admin Settings에서 incoming_tx_monitor 활성화 |
| 감지 지연 | 블록 확인 대기 시간 | ETH ~15초, SOL ~5초 대기 후 재확인 |
| 구독 미설정 (#164) | 환경 기본 네트워크만 구독 | 모니터링 대상 네트워크 확인 (known issue #164) |
| 감사 로그 미기록 | 감사 로그 비활성 | Admin Settings에서 audit_log 활성화 확인 |
| ETH 가스비 급등 | 네트워크 혼잡 | 가스비 확인 후 혼잡 완화 시 재시도 |
