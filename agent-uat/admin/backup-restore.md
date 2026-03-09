---
id: "admin-11"
title: "Admin 백업/복원 무결성 검증"
category: "admin"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "low"
tags: ["admin", "backup", "restore", "integrity", "encryption"]
---

# Admin 백업/복원 무결성 검증

## Metadata
- **ID**: admin-11
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: low -- 백업/복원 테스트, 복원으로 원상 복구

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] CLI 접근 가능 (`waiaas backup` 커맨드)

## Scenario Steps

### Step 1: 현재 데이터 상태 기록
**Action**: 백업 전 데이터 상태를 스냅샷으로 기록한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 지갑 목록이 반환된다
**Check**: 지갑 수, 정책 수, 핵심 설정값을 기록 (복원 후 비교 기준)

### Step 2: 암호화 백업 생성
**Action**: 데이터베이스의 암호화 백업을 생성한다.
```bash
curl -s -X POST http://localhost:3100/v1/admin/backup \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 백업 파일 경로 또는 백업 ID가 반환된다
**Check**: 백업 생성 성공 확인, 파일 경로 기록

### Step 3: 백업 파일 확인
**Action**: 생성된 백업 파일의 존재와 크기를 확인한다.
- 파일 크기가 0보다 큰지 확인
- 암호화되어 있는지 확인 (평문 데이터가 노출되지 않아야 함)

**Expected**: 백업 파일이 존재하고 적절한 크기이다
**Check**: 파일 크기와 암호화 상태 확인

### Step 4: 데이터 변경 시뮬레이션
**Action**: 비파괴적 데이터 변경을 수행한다 (테스트 정책 추가).
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"name": "UAT-backup-test-policy", "rules": {"daily_transfer_limit": "999"}}'
```
**Expected**: 201 Created, 테스트 정책 생성 성공
**Check**: 생성된 정책 ID 기록

### Step 5: 백업에서 복원
**Action**: Step 2에서 생성한 백업으로 데이터를 복원한다.
```bash
curl -s -X POST http://localhost:3100/v1/admin/restore \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{"backupPath": "<BACKUP_FILE_PATH>"}'
```
**Expected**: 200 OK, 복원 성공
**Check**: 복원 완료 확인. 데몬 재시작이 필요할 수 있음

### Step 6: 복원 후 데이터 비교
**Action**: 복원 후 데이터 상태를 Step 1의 스냅샷과 비교한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, Step 1과 동일한 데이터 상태
**Check**: 지갑 수 일치, Step 4의 테스트 정책이 제거되어 있는지 확인 (백업 시점으로 복원)

## Verification
- [ ] 현재 데이터 상태 기록 완료
- [ ] 암호화 백업 생성 성공
- [ ] 백업 파일 존재 및 크기 확인
- [ ] 데이터 변경 시뮬레이션 성공
- [ ] 백업 복원 성공
- [ ] 복원 후 데이터가 백업 시점과 일치

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Local operations only | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 백업 파일 경로 오류 | 잘못된 백업 경로 지정 | 백업 생성 응답의 경로 확인 |
| 암호화 키 불일치 | master_password 변경됨 | 백업 시점의 패스워드 사용 |
| 복원 중 데몬 재시작 필요 | DB 핫 스왑 불가 | 복원 후 데몬 재시작 |
| 복원 후 데이터 불일치 | 백업 파일 손상 | 새 백업 생성 후 재시도 |

## Cleanup
Step 4에서 생성한 테스트 정책은 복원(Step 5)으로 자동 삭제된다.
