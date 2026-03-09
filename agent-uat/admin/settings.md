---
id: "admin-04"
title: "Admin Settings 변경 및 반영 검증"
category: "admin"
network: ["all"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "low"
tags: ["admin", "settings", "configuration", "hot-reload"]
---

# Admin Settings 변경 및 반영 검증

## Metadata
- **ID**: admin-04
- **Category**: admin
- **Network**: all
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.01
- **Risk Level**: low -- 설정 변경 후 원복, dry-run으로 반영 확인

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 테스트 가능한 설정 항목 (예: gas_safety_margin, dry_run_default)

## Scenario Steps

### Step 1: 현재 Admin Settings 조회
**Action**: 전체 Admin Settings를 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 전체 설정 항목이 반환된다
**Check**: 각 설정 항목과 현재 값을 기록 (특히 gas_safety_margin)

### Step 2: 설정 값 기록
**Action**: 변경할 설정의 현재 값을 기록한다.
- gas_safety_margin 현재값 기록 (기본값: 120)
- 원복 시 사용할 값으로 보관

**Expected**: 현재 설정값이 명확히 기록된다
**Check**: gas_safety_margin 값 확인

### Step 3: 설정 변경
**Action**: gas_safety_margin을 150으로 변경한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"gas_safety_margin": 150}'
```
**Expected**: 200 OK, 설정 변경 성공
**Check**: 응답에서 변경 확인

### Step 4: 설정 변경 확인
**Action**: 변경된 설정을 재조회하여 반영 여부를 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, gas_safety_margin이 150으로 반영되어 있다
**Check**: `gas_safety_margin: 150` 확인. hot-reload이므로 데몬 재시작 없이 즉시 반영

### Step 5: Dry-Run으로 반영 확인
**Action**: 변경된 설정이 실제 트랜잭션 추정에 반영되는지 dry-run으로 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
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
**Expected**: 200 OK, 가스 추정에 새 margin(150%)이 적용되어 있다
**Check**: `estimatedGas` 값이 이전 dry-run 대비 증가했는지 비교 (120% -> 150%)

### Step 6: 설정 원복
**Action**: gas_safety_margin을 원래 값으로 복원한다.
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"gas_safety_margin": 120}'
```
**Expected**: 200 OK, 설정 원복 성공
**Check**: 원래 값(120)으로 복원 확인

## Verification
- [ ] 현재 설정 조회 성공
- [ ] 설정 변경 성공 (gas_safety_margin: 150)
- [ ] 변경 후 재조회 시 반영 확인
- [ ] Dry-run에서 변경된 설정 반영 확인
- [ ] 설정 원복 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Dry-run only | ethereum-sepolia | 0 | ~$0.01 (testnet) |
| **Total** | | | **~$0.01** |

> **Note**: Sepolia 테스트넷에서 dry-run만 수행하므로 실제 비용은 $0이다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 읽기 전용 설정 변경 시도 | port, host 등은 config.toml 전용 | 런타임 조정 가능한 설정만 변경 |
| 잘못된 값 형식 | 타입 불일치 (string vs number) | API 문서에서 설정 필드 타입 확인 |
| 인증 실패 | masterAuth 토큰 만료 | 재인증 수행 |
| 설정 미반영 | 일부 설정은 재시작 필요 | infrastructure 설정(port, host)은 재시작 필요 |
