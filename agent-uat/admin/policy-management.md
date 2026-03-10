---
id: "admin-05"
title: "정책 관리 CRUD 검증"
category: "admin"
auth: "master"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "policy", "management", "crud", "simulate"]
---

# 정책 관리 CRUD 검증

## Metadata
- **ID**: admin-05
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 테스트 정책 생성/삭제, simulate만 사용

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 1개 이상 지갑 생성 완료

## Scenario Steps

### Step 1: 현재 정책 목록 조회
**Action**: 기존 정책 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/policies \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 정책 목록이 반환된다
**Check**: 기존 정책 수와 내용을 기록

### Step 2: 테스트 정책 생성
**Action**: 일일 전송 한도 0.1 ETH 테스트 정책을 생성한다.
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "name": "UAT-test-daily-limit",
    "rules": {
      "daily_transfer_limit": "0.1"
    }
  }'
```
**Expected**: 201 Created, 생성된 정책 ID가 반환된다
**Check**: `id` 필드 기록

### Step 3: 생성된 정책 상세 조회
**Action**: 생성된 정책의 상세 정보를 조회한다.
```bash
curl -s http://localhost:3100/v1/policies/<POLICY_ID> \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 정책 상세 정보가 반환된다
**Check**: `name`, `rules` 필드가 생성 시 입력과 일치하는지 확인

### Step 4: 정책을 지갑에 적용
**Action**: 테스트 정책을 지갑에 적용한다.
```bash
curl -s -X PUT http://localhost:3100/v1/wallets/<WALLET_ID>/policy \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"policyId": "<POLICY_ID>"}'
```
**Expected**: 200 OK, 정책 적용 성공
**Check**: 지갑에 정책이 연결되었는지 확인

### Step 5: Simulate으로 정책 적용 확인
**Action**: 한도 초과 트랜잭션을 simulate으로 실행하여 정책 거부를 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "amount": "1000000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 정책 위반 응답 (일일 한도 0.1 ETH 초과)
**Check**: 정책 위반 사유가 응답에 포함되어 있는지 확인

### Step 6: 정책 수정
**Action**: 테스트 정책의 한도를 변경한다.
```bash
curl -s -X PUT http://localhost:3100/v1/policies/<POLICY_ID> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "name": "UAT-test-daily-limit-updated",
    "rules": {
      "daily_transfer_limit": "5.0"
    }
  }'
```
**Expected**: 200 OK, 정책 수정 성공
**Check**: 수정된 한도값(5.0) 확인

### Step 7: 수정된 정책 Simulate 확인
**Action**: 이전에 거부된 1.0 ETH 트랜잭션이 이제 통과하는지 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "amount": "1000000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 정상 simulate 결과 (정책 통과)
**Check**: 정책 위반 없이 정상 결과가 반환되는지 확인

### Step 8: 테스트 정책 삭제
**Action**: 테스트 정책을 삭제하여 환경을 정리한다.
```bash
curl -s -X DELETE http://localhost:3100/v1/policies/<POLICY_ID> \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK 또는 204 No Content, 정책 삭제 성공
**Check**: 삭제 후 정책 목록에서 테스트 정책이 제거되었는지 확인

## Verification
- [ ] 정책 목록 조회 성공
- [ ] 테스트 정책 생성 성공 (ID 반환)
- [ ] 정책 상세 조회 성공
- [ ] 정책 지갑 적용 성공
- [ ] Simulate에서 정책 위반 확인 (한도 초과 시 거부)
- [ ] 정책 수정 성공
- [ ] 수정된 정책 Simulate 통과 확인
- [ ] 테스트 정책 삭제 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Simulate only (no execution) | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 정책 충돌 | 동일 이름 정책 존재 | 유니크한 이름 사용 (UAT-test- 접두사) |
| 지갑 미연결 | 지갑에 정책 적용 실패 | 지갑 ID 확인, 정책 ID 정확성 확인 |
| default-deny 상태 | 모든 트랜잭션 거부 | ALLOWED_TOKENS/CONTRACT_WHITELIST 설정 확인 |
| 삭제 실패 | 정책이 지갑에 연결된 상태 | 지갑에서 정책 해제 후 삭제 |

## Cleanup
테스트 정책은 Step 8에서 삭제한다. 삭제 실패 시 수동으로 `DELETE /v1/policies/<POLICY_ID>`를 실행한다.
