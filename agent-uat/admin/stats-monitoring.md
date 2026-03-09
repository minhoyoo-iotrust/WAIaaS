---
id: "admin-13"
title: "Admin 통계/모니터링 API 검증"
category: "admin"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "stats", "monitoring", "api", "health"]
---

# Admin 통계/모니터링 API 검증

## Metadata
- **ID**: admin-13
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료

## Scenario Steps

### Step 1: Stats API 전체 조회
**Action**: Admin Stats API에서 전체 통계를 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 전체 통계 데이터가 반환된다
**Check**: 핵심 메트릭 필드 존재 확인

### Step 2: 핵심 메트릭 확인
**Action**: Stats에서 반환된 핵심 메트릭을 확인한다.
- 총 지갑 수 (totalWallets)
- 총 트랜잭션 수 (totalTransactions)
- 활성 세션 수 (activeSessions)
- 업타임 (uptime)

**Expected**: 각 메트릭 값이 반환된다
**Check**: 값이 합리적인 범위인지 확인 (음수 아님, 0 이상)

### Step 3: 실제 지갑 수 비교
**Action**: 실제 지갑 목록을 조회하여 Stats 지갑 수와 비교한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 목록이 반환된다
**Check**: Stats totalWallets == 실제 지갑 count 확인

### Step 4: 실제 트랜잭션 수 비교
**Action**: 실제 트랜잭션 목록을 조회하여 Stats 트랜잭션 수와 비교한다.
```bash
curl -s "http://localhost:3100/v1/transactions?limit=1" \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 트랜잭션 목록과 총 수가 반환된다
**Check**: Stats totalTransactions == 실제 트랜잭션 총 수 확인

### Step 5: Stats 트랜잭션 수 비교 확인
**Action**: Step 3과 Step 4의 비교 결과를 확인한다.
- Stats 지갑 수 == 실제 지갑 수
- Stats 트랜잭션 수 == 실제 트랜잭션 수

**Expected**: 두 비교 모두 일치한다
**Check**: 불일치 시 캐시 지연 또는 집계 오차 확인

### Step 6: 모니터링 상태 확인
**Action**: 모니터링 서비스들의 상태를 확인한다.
- IncomingTxMonitor: 활성/비활성
- BalanceMonitor: 활성/비활성
- RPC Pool: 건강 상태 (연결된 엔드포인트 수)

**Expected**: 각 모니터링 서비스의 상태가 표시된다
**Check**: 활성화된 서비스의 상태가 정상(healthy)인지 확인

### Step 7: AutoStop Plugin 상태 확인
**Action**: AutoStop Plugin의 활성화 여부를 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: AutoStop Plugin 관련 정보가 포함된다
**Check**: 활성화 여부와 설정된 조건 확인

## Verification
- [ ] Stats API 전체 조회 성공 (200)
- [ ] 핵심 메트릭 값이 합리적 범위
- [ ] Stats 지갑 수 == 실제 지갑 수
- [ ] Stats 트랜잭션 수 == 실제 트랜잭션 수
- [ ] IncomingTxMonitor 상태 확인
- [ ] BalanceMonitor 상태 확인
- [ ] RPC Pool 건강 상태 확인
- [ ] AutoStop Plugin 상태 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 통계 집계 지연 | 최근 작업 미반영 | 수 초 대기 후 재조회 |
| 캐시된 값 | Stats 캐시 갱신 주기 | 캐시 TTL 대기 후 재시도 |
| 모니터 비활성 | 관련 설정 꺼짐 | Admin Settings에서 모니터 활성화 |
| RPC Pool unhealthy | RPC 엔드포인트 연결 실패 | RPC URL 확인, 대체 엔드포인트 설정 |
| AutoStop 미설정 | AutoStop Plugin 미활성 | Admin Settings에서 AutoStop 설정 |
