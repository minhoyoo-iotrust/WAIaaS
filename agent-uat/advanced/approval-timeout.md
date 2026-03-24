---
id: "advanced-06"
title: "승인 타임아웃 자동 만료"
category: "advanced"
auth: "session + master"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0"
risk_level: "low"
tags: ["approval", "timeout", "expired", "spending-limit"]
---

# 승인 타임아웃 자동 만료

## Metadata
- **ID**: advanced-06
- **Category**: advanced
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes (testnet ETH)
- **Estimated Cost**: $0 (testnet)
- **Risk Level**: low -- 타임아웃으로 자동 만료, 온체인 실행 없음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] 마스터 패스워드 보유 (masterAuth, `X-Master-Password` 헤더)
- [ ] Owner 주소 등록 완료 (state=GRACE 또는 LOCKED)
- [ ] SPENDING_LIMIT 정책에 APPROVAL 티어 설정 (예: 0.01 ETH 초과 시 APPROVAL)
- [ ] 지갑에 Sepolia ETH 잔액 보유 (faucet에서 수령)

## Scenario Steps

### Step 1: approval_timeout을 짧게 설정
**Action**: Admin Settings API로 `approval_timeout`을 30초로 단축한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "key": "policy.approval_timeout",
    "value": "30"
  }'
```
**Expected**: 200 OK, 설정이 30초로 변경된다
**Check**: 기존 값을 기록해두고 Step 5에서 복원할 것

### Step 2: APPROVAL 티어 초과 전송 요청
**Action**: APPROVAL 티어를 초과하는 금액으로 ETH 전송을 요청한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<RECIPIENT_ADDRESS>",
    "amount": "50000000000000000",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 트랜잭션이 QUEUED 상태(tier: APPROVAL)로 생성된다
**Check**: `id`를 TX_ID로 기록

### Step 3: 타임아웃 대기
**Action**: 30초 이상 대기하여 approval_timeout이 초과되도록 한다.

> 30초 대기 후 다음 Step 진행

### Step 4: 만료 상태 확인
**Action**: 트랜잭션 상태를 조회하여 자동 만료(EXPIRED)되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 트랜잭션이 자동으로 EXPIRED 상태로 전환된다
**Check**: `status`가 `EXPIRED`. approve/reject 없이 시간 초과로 자동 만료. `txHash`가 없음

### Step 5: 설정 원복
**Action**: approval_timeout을 원래 값으로 복원한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "key": "policy.approval_timeout",
    "value": "3600"
  }'
```
**Expected**: 200 OK, 설정이 원래 값(기본 3600초)으로 복원된다

## Verification
- [ ] approval_timeout 단축 설정이 정상 적용
- [ ] APPROVAL 티어 초과 시 TX가 QUEUED 상태로 생성
- [ ] 타임아웃 초과 후 TX가 EXPIRED로 자동 전환
- [ ] EXPIRED TX에 txHash가 없음 (온체인 실행 없음)
- [ ] 설정이 원래 값으로 복원됨

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 타임아웃 만료 시나리오 | ethereum-sepolia | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 타임아웃 만료는 온체인 실행 없이 상태만 전환되므로 가스비 없음.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| EXPIRED로 전환 안 됨 | approval_timeout 설정 변경이 반영되지 않음 | Admin Settings API 호출 후 응답 확인. 데몬 hot-reload 확인 |
| EXPIRED 대신 CANCELLED 표시 | 구현 차이 | EXPIRED와 CANCELLED는 별도 상태. 실제 상태값 확인 |
| 30초 후에도 QUEUED 유지 | Expiry Worker 간격이 30초 초과 | Worker 주기 확인. 추가 대기 후 재조회 |

## Cleanup
- 타임아웃된 TX는 DB에 기록으로 남음 (삭제 불필요)
- approval_timeout 설정은 반드시 Step 5에서 원복할 것
