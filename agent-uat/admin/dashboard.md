---
id: "admin-03"
title: "Admin Dashboard 데이터 정확성 검증"
category: "admin"
auth: "master"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "dashboard", "stats", "accuracy"]
---

# Admin Dashboard 데이터 정확성 검증

## Metadata
- **ID**: admin-03
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 1개 이상 지갑 생성 완료
- [ ] 1건 이상 트랜잭션 기록 보유

## Scenario Steps

### Step 1: Dashboard 통계 API 조회
**Action**: Admin Stats API에서 Dashboard 데이터를 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 통계 데이터가 반환된다 (지갑 수, 트랜잭션 수, 세션 수 등)
**Check**: `totalWallets`, `totalTransactions`, `activeSessions`, `uptime` 등 핵심 메트릭 기록

### Step 2: 실제 지갑 목록 조회
**Action**: 세션 API로 실제 지갑 목록을 조회하여 총 지갑 수를 카운트한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 목록이 반환된다
**Check**: 지갑 수를 카운트하여 기록

### Step 3: Dashboard 지갑 수 비교
**Action**: Step 1의 Dashboard 지갑 수와 Step 2의 실제 지갑 수를 비교한다.
- Dashboard `totalWallets` == 실제 지갑 count

**Expected**: 두 값이 일치한다
**Check**: 불일치 시 캐시 지연 가능성 확인. 오차가 1-2개면 허용 범위

### Step 4: 총 잔액 확인
**Action**: 각 지갑의 잔액을 개별 조회하여 합산한 후 Dashboard 표시값과 비교한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<WALLET_ID>&network=<NETWORK> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 각 지갑의 잔액이 반환된다
**Check**: 잔액 합산값과 Dashboard 총 잔액 비교 (가스비 변동에 의한 미세 오차 허용)

### Step 5: 최근 트랜잭션 비교
**Action**: 최근 트랜잭션 목록을 조회하여 Dashboard 표시와 비교한다.
```bash
curl -s "http://localhost:3100/v1/transactions?limit=10" \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 최근 트랜잭션 목록이 반환된다
**Check**: Dashboard의 최근 활동 목록과 트랜잭션 API 결과가 일치하는지 확인

### Step 6: 네트워크별 분포 확인
**Action**: 지갑의 네트워크 분포를 확인하여 Dashboard 표시와 비교한다.
- 각 지갑의 네트워크 정보를 기반으로 분포 계산
- Dashboard의 네트워크별 분포 차트와 비교

**Expected**: 네트워크 분포가 일치한다
**Check**: 각 네트워크별 지갑 수가 Dashboard 표시와 일치

## Verification
- [ ] Dashboard 통계 API 조회 성공
- [ ] Dashboard 지갑 수 == 실제 지갑 수 (허용 오차 1-2개)
- [ ] Dashboard 총 잔액이 실제 합산값과 유사 (가스비 오차 허용)
- [ ] 최근 트랜잭션 목록 일치
- [ ] 네트워크별 분포 일치

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 지갑 수 불일치 | 캐시 지연 | 수 초 대기 후 Stats API 재조회 |
| 잔액 동기화 오차 | 온체인 잔액 변동 (가스비) | 허용 오차 범위 (가스비 1회분) 확인 |
| 트랜잭션 수 불일치 | 통계 집계 타이밍 | 새 트랜잭션 발생 후 재확인 |
| Dashboard 로딩 실패 | API 타임아웃 | 데몬 로그 확인, 데이터베이스 상태 점검 |
