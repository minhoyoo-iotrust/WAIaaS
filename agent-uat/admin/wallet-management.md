---
id: "admin-06"
title: "Admin 지갑 관리 및 잔액 검증"
category: "admin"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "wallet", "balance", "onchain"]
---

# Admin 지갑 관리 및 잔액 검증

## Metadata
- **ID**: admin-06
- **Category**: admin
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 1개 이상 지갑에 잔액 보유

## Scenario Steps

### Step 1: Admin 지갑 목록 조회
**Action**: Admin API로 전체 지갑 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 모든 지갑 목록이 반환된다
**Check**: 각 지갑의 `id`, `address`, `accountType`, 연결된 네트워크를 기록

### Step 2: Admin 표시 잔액 기록
**Action**: 각 지갑의 잔액 정보를 기록한다.
- Admin UI에서 표시되는 잔액 값을 기록
- 또는 API로 각 지갑의 잔액 조회

**Expected**: 각 지갑의 잔액이 기록된다
**Check**: 네트워크별 잔액 목록 작성

### Step 3: 온체인 잔액 직접 조회
**Action**: 각 지갑의 온체인 잔액을 직접 API로 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/balance?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 온체인 잔액이 반환된다
**Check**: 네이티브 토큰(ETH/SOL) 잔액을 기록

### Step 4: Admin 잔액 vs 온체인 잔액 비교
**Action**: Admin 표시 잔액과 직접 조회 잔액을 비교한다.
- 허용 오차: 가스비 1회분 (ETH ~0.001, SOL ~0.00001)
- 오차 범위를 초과하면 캐시 문제 가능성

**Expected**: 두 잔액이 허용 오차 내에서 일치한다
**Check**: 오차 비율 계산 및 허용 범위 확인

### Step 5: 지갑 상세 정보 확인
**Action**: 각 지갑의 상세 정보를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 상세 정보가 반환된다
**Check**: `address` (올바른 형식), `accountType` (eoa/smart), 연결된 네트워크, owner 상태 확인

### Step 6: 토큰 잔액 확인
**Action**: 지갑의 토큰 잔액을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/tokens?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 보유 토큰 목록과 잔액이 반환된다
**Check**: USDC 등 보유 토큰의 잔액이 정확한지 확인. 미보유 토큰은 목록에 포함되지 않거나 0으로 표시

## Verification
- [ ] Admin 지갑 목록 조회 성공
- [ ] Admin 잔액 == 온체인 잔액 (허용 오차 범위 내)
- [ ] 지갑 상세 정보 정확 (address, accountType, networks)
- [ ] 토큰 잔액 조회 성공 및 일치 확인
- [ ] Owner 상태 표시 정확

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | ethereum-mainnet, solana-mainnet | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 잔액 캐시 지연 | 최근 트랜잭션 미반영 | 수 초 대기 후 재조회 또는 강제 리프레시 |
| 토큰 인덱서 미동기화 | ERC-20/SPL 토큰 잔액 미반영 | 토큰 레지스트리에 해당 토큰 등록 확인 |
| 네트워크 연결 오류 | RPC 엔드포인트 오류 | RPC Pool 상태 확인, 대체 엔드포인트 시도 |
| accountType 불일치 | Smart Account 인식 오류 | 지갑 생성 시 accountType 설정 확인 |
