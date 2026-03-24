---
id: "advanced-07"
title: "DELAY 티어 텔레그램 취소"
category: "advanced"
auth: "session + master"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "low"
tags: ["delay", "cancel", "telegram", "keyboard", "spending-limit"]
---

# DELAY 티어 텔레그램 취소

## Metadata
- **ID**: advanced-07
- **Category**: advanced
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes (testnet ETH)
- **Estimated Cost**: $0 (testnet)
- **Risk Level**: low -- 테스트넷, cancel 시 온체인 실행 없음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] 마스터 패스워드 보유 (masterAuth, `X-Master-Password` 헤더)
- [ ] 텔레그램 봇 알림 설정 완료 (telegram_bot_token, chat_id)
- [ ] SPENDING_LIMIT 정책에 DELAY 티어 설정 (예: $1 초과 $3 이하 → DELAY)
- [ ] 지갑에 Sepolia ETH 잔액 보유 (faucet에서 수령)

## Scenario Steps

### Step 1: 정책 및 알림 설정 확인
**Action**: SPENDING_LIMIT 정책의 DELAY 티어 범위와 텔레그램 알림 설정을 확인한다.
```bash
# 정책 확인
curl -s http://localhost:3100/v1/policies \
  -H 'Authorization: Bearer <session-token>'
```
```bash
# 알림 설정 확인
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: SPENDING_LIMIT에 `delay_max_usd` 티어가 설정되어 있고, 텔레그램 알림이 활성화되어 있다
**Check**: `notify_max_usd < 전송 금액(USD) ≤ delay_max_usd` 범위를 확인. `notifications.enabled`와 `telegram_bot_token` 설정 확인

### Step 2: delay_seconds를 짧게 설정
**Action**: 테스트 편의를 위해 `policy_defaults_delay_seconds`를 60초로 단축한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"settings": [{"key": "security.policy_defaults_delay_seconds", "value": "60"}]}'
```
**Expected**: 200 OK, 설정이 60초로 변경된다
**Check**: 기존 값을 기록해두고 Step 8에서 복원할 것

### Step 3: DELAY 티어 전송 요청 (취소 시나리오)
**Action**: DELAY 티어에 해당하는 금액으로 ETH 전송을 요청한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<RECIPIENT_ADDRESS>",
    "amount": "20000000000000000",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 트랜잭션이 `PENDING` 상태로 생성된다 (이후 QUEUED로 전환)
**Check**: `id`를 TX_ID_1로 기록

### Step 4: QUEUED (DELAY) 상태 확인
**Action**: 트랜잭션이 QUEUED 상태(tier: DELAY)로 전환되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID_1> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: `status: "QUEUED"`, `tier: "DELAY"`
**Check**: 텔레그램에 TX_QUEUED 알림이 도착하고, 메시지에 **Cancel 인라인 키보드 버튼**이 표시되는지 확인

### Step 5: 텔레그램 Cancel 버튼으로 취소
**Action**: 텔레그램에서 Cancel 인라인 키보드 버튼을 눌러 트랜잭션을 취소한다.

> 텔레그램 앱에서 Cancel 버튼을 직접 터치한다.

**Expected**: 텔레그램에서 취소 확인 응답이 표시된다
**Check**: 텔레그램 메시지가 업데이트되거나 취소 확인 메시지가 전송된다

### Step 6: 취소된 트랜잭션 상태 확인
**Action**: 취소된 트랜잭션의 상태를 API로 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID_1> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, `status: "CANCELLED"`, `txHash: null`
**Check**: 온체인 실행 없이 CANCELLED 상태. delay 대기 중 취소 성공

### Step 7: DELAY 자동 실행 시나리오 (취소하지 않은 경우)
**Action**: 두 번째 DELAY 티어 전송을 요청하고, 이번에는 취소하지 않고 delay 만료를 기다린다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<RECIPIENT_ADDRESS>",
    "amount": "20000000000000000",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: QUEUED (tier: DELAY). `id`를 TX_ID_2로 기록

> 텔레그램에 Cancel 버튼이 표시되지만 누르지 않고 60초 대기

```bash
# 60초 + 여유 후 상태 확인
curl -s http://localhost:3100/v1/transactions/<TX_ID_2> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: delay 만료 후 자동 실행되어 `status: "CONFIRMED"`, `txHash`가 존재
**Check**: Cancel하지 않으면 delay 후 정상 실행됨을 확인

### Step 8: 설정 원복
**Action**: delay_seconds를 원래 값으로 복원한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"settings": [{"key": "security.policy_defaults_delay_seconds", "value": "300"}]}'
```
**Expected**: 200 OK, 설정이 원래 값(기본 300초)으로 복원된다

## Verification
- [ ] DELAY 티어 범위 내 전송 시 TX가 QUEUED (tier: DELAY)로 생성
- [ ] 텔레그램에 TX_QUEUED 알림이 도착하고 Cancel 인라인 키보드 버튼이 표시
- [ ] Cancel 버튼 터치 시 TX가 CANCELLED로 전환 (온체인 실행 없음)
- [ ] Cancel하지 않으면 delay 만료 후 자동 실행되어 CONFIRMED
- [ ] 설정이 원래 값으로 복원됨

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ETH transfer (Step 7, 자동 실행) | ethereum-sepolia | ~21,000 | $0 (testnet) |
| Cancel 시나리오 (Step 5) | ethereum-sepolia | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 테스트넷(Sepolia)에서 실행하므로 실제 비용 없음. Cancel 시나리오는 온체인 실행 없이 상태만 전환된다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| TX가 바로 실행됨 (QUEUED 안 됨) | 전송 금액이 DELAY 티어 범위 밖 | 정책의 `notify_max_usd` ~ `delay_max_usd` 범위에 맞게 금액 조정 |
| 텔레그램에 알림 안 옴 | 텔레그램 봇 미설정 | Admin Settings에서 telegram_bot_token, chat_id 확인 |
| Cancel 키보드 버튼 없음 | 알림에 키보드가 포함되지 않음 | 데몬 로그에서 TX_QUEUED 알림 전송 확인 |
| Cancel 후에도 QUEUED 유지 | 콜백 처리 실패 | 데몬 로그에서 `cancel:{txId}` 콜백 처리 확인 |
| 자동 실행 안 됨 | Delay Worker 미동작 | Worker 주기 확인, 추가 대기 후 재조회 |

## Cleanup
- Cancel 시나리오의 CANCELLED TX는 DB에 기록으로 남음 (삭제 불필요)
- 자동 실행 시나리오에서 테스트넷 ETH가 전송됨 (회수 불필요)
- delay_seconds 설정은 반드시 Step 8에서 원복할 것
