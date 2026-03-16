---
id: "admin-ops-01"
title: "수신 트랜잭션 감지"
category: "admin-ops"
auth: "session"
network: ["ethereum-sepolia", "solana-devnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "low"
tags: ["incoming", "monitor", "detection", "sepolia", "devnet"]
---

# 수신 트랜잭션 감지

## Metadata
- **ID**: admin-ops-01
- **Category**: admin-ops
- **Network**: ethereum-sepolia, solana-devnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: low -- Testnet 자금만 사용, 자기 전송으로 수신 감지 테스트

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] IncomingTxMonitor 활성화 상태 (Admin Settings에서 incoming_tx_monitor 설정 확인)
- [ ] Sepolia ETH 보유 (가스비용, 최소 0.002 ETH)
- [ ] Devnet SOL 보유 (최소 0.1 SOL)
- [ ] 알림 채널 설정 완료 (ntfy 등) -- 선택적이지만 알림 수신 확인에 필요

## Scenario Steps

### Step 1: IncomingTxMonitor 상태 확인
**Action**: IncomingTxMonitor가 활성화되어 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 모니터링 상태 정보가 반환된다
**Check**: IncomingTxMonitor 관련 필드에서 활성 상태 확인. 비활성이면 Admin Settings에서 활성화 안내

### Step 2: 모니터링 대상 지갑 주소 확인
**Action**: 모니터링 대상으로 등록된 지갑 주소를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 지갑 목록에서 Sepolia EVM 지갑과 Devnet Solana 지갑 확인
**Check**: 각 지갑의 `address` 기록. 이 주소가 모니터링 대상인지 확인

### Step 3: Sepolia 자기 전송 실행
**Action**: Sepolia에서 자기 주소로 ETH를 전송하여 수신 트랜잭션을 발생시킨다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_EVM_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 트랜잭션이 전송된다
**Check**: `txId`, `txHash` 기록. 이 트랜잭션이 수신으로도 감지되어야 함

### Step 4: 수신 트랜잭션 감지 확인 (Sepolia)
**Action**: 블록 확인 시간(~15초) 대기 후 수신 트랜잭션을 조회한다.
```bash
# 15-30초 대기 후 실행
curl -s http://localhost:3100/v1/wallet/incoming?walletId=<EVM_WALLET_ID>&network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 수신 트랜잭션 목록에 Step 3의 전송이 포함된다
**Check**: Step 3의 tx hash와 일치하는 수신 트랜잭션이 목록에 있는지 확인

### Step 5: 알림 수신 확인
**Action**: 설정된 알림 채널(ntfy 등)에서 수신 트랜잭션 알림을 확인한다.
```bash
# ntfy 채널 확인 (설정된 경우)
# 브라우저에서 ntfy.sh/<topic> 접속하여 알림 확인
# 또는 Admin UI의 알림 로그 확인
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 수신 트랜잭션에 대한 알림이 전송되었다
**Check**: 알림 채널에서 "Incoming transaction detected" 관련 메시지 확인. 알림 미설정 시 SKIP 가능

### Step 6: Devnet SOL 자기 전송
**Action**: Devnet에서 자기 주소로 SOL을 전송하여 Solana 수신 트랜잭션을 발생시킨다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<SOL_WALLET_ID>",
    "type": "TRANSFER",
    "to": "<MY_SOL_ADDRESS>",
    "amount": "10000000",
    "network": "solana-devnet"
  }'
```
**Expected**: 200 OK, Solana 트랜잭션 전송 성공
**Check**: `txId`, `txHash` 기록

### Step 7: Devnet 수신 트랜잭션 감지 확인
**Action**: Solana는 빠르게 컨펌되므로 5초 대기 후 수신 트랜잭션을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/incoming?walletId=<SOL_WALLET_ID>&network=solana-devnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 수신 트랜잭션 목록에 Step 6의 전송이 포함된다
**Check**: Step 6의 tx hash와 일치하는 수신 트랜잭션 확인

### Step 8: 감사 로그에서 수신 TX 이벤트 확인
**Action**: 감사 로그에서 수신 트랜잭션 감지 이벤트를 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/audit-logs?event=incoming_tx \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 감사 로그에 수신 트랜잭션 이벤트가 기록되어 있다
**Check**: Sepolia와 Devnet 수신 TX 이벤트가 각각 기록되어 있는지 확인

## Verification
- [ ] IncomingTxMonitor 활성 상태 확인
- [ ] Sepolia 자기 전송 성공
- [ ] Sepolia 수신 트랜잭션 감지 확인 (incoming TX 목록에 포함)
- [ ] 알림 채널에서 수신 알림 확인 (설정된 경우)
- [ ] Devnet SOL 자기 전송 성공
- [ ] Devnet 수신 트랜잭션 감지 확인
- [ ] 감사 로그에 수신 TX 이벤트 기록 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Sepolia ETH self-transfer | ethereum-sepolia | ~21,000 | ~$0.01 |
| Devnet SOL self-transfer | solana-devnet | ~5,000 lamports | ~$0 |
| **Total** | | | **~$0.01** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| IncomingTxMonitor inactive | 모니터 미활성화 | Admin Settings에서 `incoming_tx_monitor` 활성화 |
| No incoming TX detected | 블록 확인 시간 미경과 | Sepolia는 30초, Devnet은 5초 대기 후 재조회 |
| Notification not received | 알림 채널 미설정 | Admin UI에서 ntfy 또는 다른 알림 채널 설정 |
| Subscription not active | 지갑이 모니터링 대상 아님 | 해당 지갑의 네트워크가 모니터링 구독 목록에 포함되어 있는지 확인 |
| Audit log empty | 감사 로그 비활성화 | Admin Settings에서 audit logging 활성화 확인 |
