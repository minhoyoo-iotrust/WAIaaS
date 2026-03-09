---
id: "admin-08"
title: "Admin DeFi 포지션 탭 검증"
category: "admin"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "defi", "positions", "lending", "staking"]
---

# Admin DeFi 포지션 탭 검증

## Metadata
- **ID**: admin-08
- **Category**: admin
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] DeFi 포지션 보유 (Aave, Kamino, Lido 등, 없으면 빈 상태 확인으로 SKIP 가능)

## Scenario Steps

### Step 1: DeFi 포지션 조회
**Action**: 지갑의 DeFi 포지션을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/defi-positions \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, DeFi 포지션 목록이 반환된다 (보유 시) 또는 빈 배열 (미보유 시)
**Check**: 프로토콜별 포지션 수와 기본 정보 확인

### Step 2: Admin UI DeFi 탭 확인
**Action**: 사용자에게 Admin UI `/admin/defi` 페이지를 확인하도록 요청한다.
- DeFi 포지션 카드/테이블이 표시되는지 확인
- 프로토콜 이름, 포지션 유형 (Supply/Borrow/Stake) 확인

**Expected**: Admin UI에 DeFi 포지션이 정상 표시된다
**Check**: 사용자에게 "DeFi 탭에 포지션이 표시되나요?" 확인

### Step 3: 프로토콜별 포지션 상세 확인
**Action**: 각 프로토콜의 포지션 상세를 확인한다.
- **Lending (Aave/Kamino)**: supply amount, borrow amount, health factor
- **Staking (Lido/Jito)**: staked amount, reward rate
- **Yield (Pendle)**: PT/YT balance, maturity date

**Expected**: 각 프로토콜의 핵심 메트릭이 표시된다
**Check**: 금액, 비율, 상태 등 핵심 데이터 확인

### Step 4: 온체인 포지션 비교
**Action**: 해당 프로토콜의 API를 통해 직접 포지션을 확인하고 Admin 표시와 비교한다.
- 이자 누적으로 인한 실시간 변동이 있으므로 +-1% 오차를 허용한다

**Expected**: Admin 표시 포지션과 온체인 실제 포지션이 1% 이내로 일치한다
**Check**: 금액 차이가 1% 이내인지 계산

### Step 5: 빈 포지션 상태 확인
**Action**: DeFi 포지션이 없는 지갑에서 빈 상태 표시를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallets/<EMPTY_WALLET_ID>/defi-positions \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 빈 배열 또는 "포지션 없음" 메시지
**Check**: 에러 없이 빈 상태가 정상 표시되는지 확인

## Verification
- [ ] DeFi 포지션 API 조회 성공 (200)
- [ ] Admin UI DeFi 탭 정상 표시
- [ ] 프로토콜별 포지션 상세 정보 정확
- [ ] 온체인 실제 포지션과 Admin 표시 일치 (오차 1% 이내)
- [ ] 빈 포지션 상태 정상 표시 (에러 없음)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | ethereum-mainnet, solana-mainnet | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 포지션 미보유 | 활성 DeFi 포지션 없음 | 정상 -- 빈 목록 표시 확인 후 SKIP |
| 프로토콜 API 오류 | 외부 프로토콜 서버 오류 | 잠시 후 재시도, 프로토콜 상태 확인 |
| 이자 누적 차이 | 실시간 이자로 미세 변동 | 1% 오차 허용 |
| 포지션 누락 | 지원하지 않는 프로토콜 | 지원 프로토콜 목록 확인 |
