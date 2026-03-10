---
id: "admin-14"
title: "지갑 CRUD 검증"
category: "admin"
auth: "master"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "wallet", "crud", "basic"]
---

# 지갑 CRUD 검증

## Metadata
- **ID**: admin-14
- **Category**: admin
- **Network**: all (네트워크 무관)
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 온체인 트랜잭션 없음, 지갑 생성/삭제만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 마스터 패스워드 보유 (지갑 생성/수정/삭제에 masterAuth 필요)
- [ ] 기존 지갑 목록 확인 완료 (테스트 전 원본 목록 기록)

## Scenario Steps

### Step 1: 기존 지갑 목록 기록
**Action**: 현재 지갑 목록을 조회하여 테스트 전 상태를 기록한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 현재 지갑 목록이 반환된다
**Check**: 응답의 `wallets` 배열 길이를 기록 (`ORIGINAL_COUNT`)

### Step 2: EVM 지갑 생성
**Action**: 테스트용 EVM 지갑을 생성한다. 라벨에 타임스탬프를 포함하여 고유성을 보장한다.
```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "environment": "ethereum",
    "label": "uat-test-evm-<timestamp>"
  }'
```
**Expected**: 201 Created, 새 EVM 지갑 정보가 반환된다
**Check**: 응답에 `id`, `address`, `environment: "ethereum"` 필드 확인. `EVM_WALLET_ID` 기록

### Step 3: EVM 지갑 상세 조회
**Action**: 생성된 EVM 지갑의 상세 정보를 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<EVM_WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 상세 정보가 반환된다
**Check**: `id`, `address`, `label`, `environment` 필드가 Step 2 생성 정보와 일치

### Step 4: EVM 지갑 라벨 변경
**Action**: 생성된 EVM 지갑의 라벨을 변경한다.
```bash
curl -s -X PATCH http://localhost:3100/v1/wallets/<EVM_WALLET_ID> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "label": "uat-test-evm-renamed-<timestamp>"
  }'
```
**Expected**: 200 OK, 변경된 라벨이 반환된다
**Check**: 응답의 `label` 필드가 새 라벨과 일치

### Step 5: 지갑 목록에서 생성된 지갑 확인
**Action**: 지갑 목록에서 새로 생성된 EVM 지갑이 포함되어 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 지갑 목록에 EVM 테스트 지갑이 포함되어 있다
**Check**: `wallets` 배열 길이가 `ORIGINAL_COUNT + 1` 이상, 변경된 라벨의 지갑 존재

### Step 6: Solana 지갑 생성
**Action**: 테스트용 Solana 지갑을 생성한다.
```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "environment": "solana",
    "label": "uat-test-sol-<timestamp>"
  }'
```
**Expected**: 201 Created, 새 Solana 지갑 정보가 반환된다
**Check**: 응답에 `id`, `address`, `environment: "solana"` 필드 확인. `SOL_WALLET_ID` 기록

### Step 7: Solana 지갑 조회
**Action**: 생성된 Solana 지갑의 상세 정보를 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<SOL_WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Solana 지갑 상세 정보가 반환된다
**Check**: `id`, `address`, `label`, `environment: "solana"` 필드 확인

### Step 8: 테스트 지갑 삭제 (EVM)
**Action**: 생성한 EVM 테스트 지갑을 삭제한다.
```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/<EVM_WALLET_ID> \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK 또는 204 No Content
**Check**: 삭제 성공 응답 확인

### Step 9: 테스트 지갑 삭제 (Solana)
**Action**: 생성한 Solana 테스트 지갑을 삭제한다.
```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/<SOL_WALLET_ID> \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK 또는 204 No Content
**Check**: 삭제 성공 응답 확인

### Step 10: 삭제 확인
**Action**: 지갑 목록에서 테스트 지갑이 제거되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 지갑 목록이 원래 상태로 복원되어 있다
**Check**: `wallets` 배열 길이가 `ORIGINAL_COUNT`와 동일, 테스트 라벨 지갑 없음

## Verification
- [ ] EVM 지갑 생성 성공 (201 응답, id/address/environment 필드 존재)
- [ ] EVM 지갑 상세 조회 성공 (생성 정보와 일치)
- [ ] EVM 지갑 라벨 변경 성공 (새 라벨 반영)
- [ ] Solana 지갑 생성 성공 (201 응답, environment: solana)
- [ ] Solana 지갑 상세 조회 성공
- [ ] EVM 테스트 지갑 삭제 성공
- [ ] Solana 테스트 지갑 삭제 성공
- [ ] 최종 지갑 목록이 원래 목록과 동일 (기존 지갑 불변)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 지갑 생성/조회/수정/삭제 | N/A (오프체인) | 0 | ~$0 |
| **Total** | | | **~$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 401 Unauthorized (지갑 생성) | masterAuth 헤더 누락 | `X-Master-Password` 헤더에 마스터 패스워드 추가 |
| 401 Unauthorized (지갑 조회) | sessionAuth 토큰 만료 | 세션 토큰 갱신 (`POST /v1/sessions/renew`) |
| 409 Conflict (지갑 생성) | 중복 라벨 | 타임스탬프를 포함한 고유 라벨 사용 |
| 400 Bad Request (지갑 삭제) | 세션에 연결된 지갑 삭제 시도 | 해당 세션을 먼저 해제하거나 다른 지갑으로 전환 |
| 404 Not Found (지갑 조회) | 잘못된 지갑 ID | Step 2/6에서 반환된 정확한 ID 사용 확인 |

## Cleanup
이 시나리오는 Step 8-10에서 자동으로 cleanup을 수행한다.

- EVM 테스트 지갑 삭제 (Step 8)
- Solana 테스트 지갑 삭제 (Step 9)
- 삭제 확인 (Step 10)

**만약 시나리오가 중간에 실패하여 cleanup이 완료되지 않은 경우:**

1. 지갑 목록 조회로 `uat-test-` 라벨 지갑 확인:
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```

2. `uat-test-` 라벨 지갑을 수동 삭제:
```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/<wallet-id> \
  -H 'X-Master-Password: <master-password>'
```
