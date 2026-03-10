---
id: "advanced-05"
title: "잔액 모니터링"
category: "advanced"
auth: "session"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: true
estimated_cost_usd: "0.50"
risk_level: "medium"
tags: ["balance", "monitoring", "alert", "notification"]
---

# 잔액 모니터링

## Metadata
- **ID**: advanced-05
- **Category**: advanced
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.50
- **Risk Level**: medium -- 메인넷 자기 전송으로 잔액 변동 발생, 손실은 가스비만

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] 잔액 모니터링 활성화 (Admin Settings)
- [ ] 알림 채널 설정 (ntfy 등)
- [ ] ETH 보유 (Ethereum Mainnet, 최소 0.002 ETH) 또는 SOL 보유 (Solana Mainnet, 최소 0.01 SOL)

## Scenario Steps

### Step 1: 잔액 모니터링 설정 확인
**Action**: Admin Settings에서 잔액 모니터링 관련 설정을 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, balance_monitor 관련 설정이 포함된다
**Check**: 잔액 모니터링 활성화 여부, 임계값(threshold) 설정 확인

### Step 2: 현재 잔액 기록
**Action**: 대상 지갑의 현재 잔액을 기록한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 현재 잔액이 반환된다
**Check**: 잔액 값을 기록 (비교 기준)

### Step 3: 잔액 변동 임계값 확인
**Action**: 잔액 변동 알림이 트리거되는 임계값을 확인한다.
- Admin Settings에서 balance_threshold 또는 관련 설정 확인
- 임계값이 너무 높으면 테스트를 위해 낮게 조정 필요

**Expected**: 임계값 설정이 확인된다
**Check**: 자기 전송 금액이 임계값을 초과하도록 설정되어 있는지 확인

### Step 4: 자기 전송으로 잔액 변동 발생
**Action**: 소액 자기 전송으로 잔액 변동을 발생시킨다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID 반환
**Check**: `txId` 기록, 가스비 차감으로 잔액 변동 발생

### Step 5: 잔액 변동 알림 수신 확인
**Action**: 설정된 알림 채널(ntfy 등)에서 잔액 변동 알림이 수신되었는지 확인한다.
- ntfy 토픽 구독 확인 또는 Admin UI 알림 로그 확인
- 알림 내용: 지갑 ID, 변동 금액, 이전/이후 잔액

**Expected**: 잔액 변동 알림이 수신된다
**Check**: 사용자에게 "알림 채널에서 잔액 변동 알림이 보이시나요?" 확인

### Step 6: Stats API에서 모니터링 이벤트 확인
**Action**: Admin Stats에서 잔액 모니터링 이벤트를 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 잔액 모니터링 관련 이벤트/메트릭이 포함된다
**Check**: 모니터링 이벤트 카운트 또는 최근 이벤트 기록 확인

## Verification
- [ ] 잔액 모니터링 설정 확인 (활성화, 임계값)
- [ ] 현재 잔액 기록 완료
- [ ] 자기 전송 성공 (잔액 변동 발생)
- [ ] 잔액 변동 알림 수신 확인
- [ ] Stats에서 모니터링 이벤트 기록 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ETH self-transfer | ethereum-mainnet | ~21,000 | ~$0.50 |
| **Total** | | | **~$0.50** |

> **Note**: 자기 전송이므로 가스비만 소비된다. Solana 사용 시 비용은 ~$0.001로 대폭 절감된다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 모니터링 비활성 | balance_monitor 설정 꺼짐 | Admin Settings에서 활성화 |
| 알림 채널 미설정 | ntfy topic 미설정 | `PUT /v1/admin/settings`로 ntfy 설정 또는 지갑별 notify_topic 설정 |
| 임계값 미도달 | 잔액 변동이 임계값보다 작음 | 임계값을 낮추거나 전송 금액 증가 |
| 알림 지연 | 이벤트 처리 비동기 | 수 초 대기 후 재확인 |
| ntfy 서버 미접근 | 네트워크 문제 | ntfy 서버 URL 확인, 방화벽 설정 확인 |
