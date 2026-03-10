---
id: "admin-10"
title: "Admin 감사 로그 정확성 검증"
category: "admin"
auth: "master"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "audit", "logs", "compliance"]
---

# Admin 감사 로그 정확성 검증

## Metadata
- **ID**: admin-10
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 1건 이상 작업 수행 이력 (트랜잭션, 설정 변경 등)

## Scenario Steps

### Step 1: 감사 로그 전체 조회
**Action**: 감사 로그를 전체 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/audit-logs \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 감사 로그 목록이 반환된다
**Check**: 로그 항목 수와 최근 로그의 타임스탬프 확인

### Step 2: 최근 수행 작업 식별
**Action**: 현재 세션에서 수행한 작업들을 식별한다.
- 트랜잭션 전송 (transaction_sent)
- 설정 변경 (settings_updated)
- 정책 변경 (policy_created/updated/deleted)
- 인증 시도 (auth_attempt)

**Expected**: 수행한 작업 목록이 식별된다
**Check**: 이전 시나리오에서 수행한 작업과 대조

### Step 3: 작업별 감사 로그 존재 확인
**Action**: 각 수행 작업에 대한 감사 로그가 존재하는지 확인한다.
- 감사 로그 목록에서 해당 작업의 이벤트를 검색
- timestamp 기준으로 최근 작업 필터링

**Expected**: 모든 수행 작업에 대한 감사 로그가 존재한다
**Check**: 누락된 작업이 없는지 확인

### Step 4: 로그 상세 필드 확인
**Action**: 개별 감사 로그의 상세 필드를 확인한다.
- **timestamp**: ISO 8601 형식
- **actor**: 수행 주체 (session ID 또는 admin)
- **action**: 수행된 작업 유형
- **resource**: 대상 리소스 (지갑 ID, 정책 ID 등)
- **details**: 상세 정보 (변경 내용, 파라미터 등)

**Expected**: 모든 필수 필드가 정확히 기록되어 있다
**Check**: 각 필드의 값이 실제 수행 내용과 일치하는지 확인

### Step 5: 이벤트 타입 필터링
**Action**: 특정 이벤트 타입으로 필터링한다.
```bash
curl -s "http://localhost:3100/v1/admin/audit-logs?event=auth_attempt" \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 해당 이벤트 타입의 로그만 반환된다
**Check**: 반환된 로그의 이벤트 타입이 모두 `auth_attempt`인지 확인

### Step 6: 시간 범위 필터링
**Action**: 시간 범위로 감사 로그를 필터링한다.
```bash
curl -s "http://localhost:3100/v1/admin/audit-logs?from=2026-03-09T00:00:00Z&to=2026-03-10T00:00:00Z" \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 지정 시간 범위 내의 로그만 반환된다
**Check**: 반환된 로그의 timestamp가 모두 지정 범위 내인지 확인

## Verification
- [ ] 감사 로그 전체 조회 성공
- [ ] 수행 작업에 대한 로그 존재 확인
- [ ] 로그 상세 필드 정확 (timestamp, actor, action, resource, details)
- [ ] 이벤트 타입 필터링 동작
- [ ] 시간 범위 필터링 동작

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 감사 로그 비활성 | audit_log 설정 꺼짐 | Admin Settings에서 활성화 |
| 오래된 로그 없음 | 로그 보존 기간 초과 | 로그 보존 정책 확인 |
| 이벤트 타입 불일치 | 필터 파라미터 오류 | 지원하는 이벤트 타입 목록 확인 |
| 시간 범위 결과 없음 | 해당 기간 활동 없음 | 범위를 넓히거나 활동 후 재시도 |
