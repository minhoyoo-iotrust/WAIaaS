---
id: "admin-09"
title: "Admin 알림 설정 및 수신 검증"
category: "admin"
network: ["all"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "low"
tags: ["admin", "notification", "ntfy", "alert", "channel"]
---

# Admin 알림 설정 및 수신 검증

## Metadata
- **ID**: admin-09
- **Category**: admin
- **Network**: all
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: low -- Testnet 자기 전송으로 알림 트리거

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] ntfy 또는 다른 알림 채널 설정 가능
- [ ] Testnet 지갑 보유 (Sepolia 또는 Devnet)

## Scenario Steps

### Step 1: 현재 알림 설정 조회
**Action**: Admin Settings에서 알림 관련 설정을 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, notification 관련 설정이 포함된다
**Check**: ntfy 서버 URL, 기본 토픽 설정 확인

### Step 2: ntfy 채널 설정
**Action**: ntfy 알림 채널을 설정한다 (이미 설정되어 있으면 SKIP).
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"notification_ntfy_url": "https://ntfy.sh", "notification_ntfy_topic": "<YOUR_TOPIC>"}'
```
**Expected**: 200 OK, 알림 설정 변경 성공
**Check**: 설정 변경이 반영되었는지 확인

### Step 3: 지갑별 알림 토픽 확인
**Action**: 지갑의 per-wallet 알림 토픽(sign_topic/notify_topic)을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 정보에 알림 토픽이 포함된다
**Check**: `sign_topic`, `notify_topic` 필드 확인 (per-wallet 방식)

### Step 4: 알림 트리거 (Testnet 자기 전송)
**Action**: Testnet에서 자기 전송을 실행하여 알림을 트리거한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 트랜잭션 생성 성공
**Check**: `txId` 기록

### Step 5: 알림 수신 확인
**Action**: ntfy 채널에서 트랜잭션 알림 메시지 수신을 확인한다.
- ntfy 웹 UI (https://ntfy.sh/<YOUR_TOPIC>)에서 확인
- 또는 Admin UI 알림 로그에서 확인

**Expected**: 트랜잭션 관련 알림이 수신된다
**Check**: 사용자에게 "ntfy 채널에서 트랜잭션 알림이 보이시나요?" 확인

### Step 6: 알림 이벤트 유형 확인
**Action**: 수신된 알림의 이벤트 유형을 확인한다.
- transaction_sent: 트랜잭션 전송 완료
- incoming_tx: 수신 트랜잭션 감지
- balance_change: 잔액 변동

**Expected**: 이벤트 유형이 정확히 표시된다
**Check**: 알림 메시지에 이벤트 유형, 지갑 ID, 금액 등 핵심 정보 포함 확인

## Verification
- [ ] 알림 설정 조회 성공
- [ ] ntfy 채널 설정 성공 (또는 이미 설정)
- [ ] 지갑별 알림 토픽 확인
- [ ] Testnet 자기 전송으로 알림 트리거 성공
- [ ] ntfy 채널에서 알림 수신 확인
- [ ] 알림 이벤트 유형 정확

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Sepolia ETH self-transfer | ethereum-sepolia | ~21,000 | ~$0.01 |
| **Total** | | | **~$0.01** |

> **Note**: Sepolia 테스트넷이므로 실제 비용은 $0이다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| ntfy 서버 미접근 | 네트워크 문제 또는 URL 오류 | ntfy 서버 URL 확인, 방화벽 설정 확인 |
| 토픽 미설정 | notify_topic이 비어있음 | 지갑 설정에서 notify_topic 설정 |
| 글로벌 NtfyChannel 미지원 | per-wallet 방식으로 전환됨 | 지갑별 notify_topic 설정 (글로벌 채널 제거됨) |
| 알림 지연 | 비동기 이벤트 처리 | 수 초 대기 후 재확인 |
| Sepolia ETH 부족 | 테스트넷 ETH 부족 | Sepolia faucet에서 ETH 수급 |
