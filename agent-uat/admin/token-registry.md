---
id: "admin-12"
title: "Admin 토큰 레지스트리 검증"
category: "admin"
auth: "master"
network: ["ethereum-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "token", "registry", "custom", "erc20"]
---

# Admin 토큰 레지스트리 검증

## Metadata
- **ID**: admin-12
- **Category**: admin
- **Network**: ethereum-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 레지스트리 조회/등록/삭제만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] 등록할 커스텀 토큰의 contract address 준비 (예: WETH, DAI 등)

## Scenario Steps

### Step 1: 현재 토큰 레지스트리 조회
**Action**: 등록된 토큰 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/admin/tokens \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 토큰 레지스트리 목록이 반환된다
**Check**: 기본 등록 토큰(USDC, USDT, WETH 등) 확인

### Step 2: 기본 등록 토큰 확인
**Action**: 기본 등록 토큰의 정보를 확인한다.
- 토큰 이름, 심볼, decimals, contract address
- 네트워크별 등록 상태

**Expected**: 기본 토큰이 올바르게 등록되어 있다
**Check**: USDC 정보: symbol=USDC, decimals=6, 올바른 contract address

### Step 3: 커스텀 토큰 등록
**Action**: 테스트용 커스텀 토큰을 등록한다 (예: DAI).
```bash
curl -s -X POST http://localhost:3100/v1/admin/tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <master-password>' \
  -d '{
    "contractAddress": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "network": "ethereum-mainnet",
    "symbol": "DAI",
    "decimals": 18
  }'
```
**Expected**: 201 Created, 등록된 토큰 ID가 반환된다
**Check**: `id` 필드 기록

### Step 4: 등록 토큰 확인
**Action**: 등록된 토큰 목록에서 새 토큰이 포함되어 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/tokens \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, 새로 등록한 토큰(DAI)이 목록에 포함된다
**Check**: DAI 토큰의 symbol, decimals, contractAddress 확인

### Step 5: 등록 토큰 잔액 조회
**Action**: 등록한 토큰의 잔액을 지갑에서 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/tokens?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 토큰 잔액 목록에 DAI가 포함된다
**Check**: DAI 보유 시 잔액 표시, 미보유 시 0 또는 목록에서 제외

### Step 6: 테스트 토큰 삭제
**Action**: 테스트 토큰을 레지스트리에서 삭제한다.
```bash
curl -s -X DELETE http://localhost:3100/v1/admin/tokens/<TOKEN_ID> \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK 또는 204 No Content, 토큰 삭제 성공
**Check**: 삭제 후 토큰 목록에서 DAI가 제거되었는지 확인

## Verification
- [ ] 토큰 레지스트리 조회 성공
- [ ] 기본 등록 토큰 정보 정확 (USDC, USDT 등)
- [ ] 커스텀 토큰 등록 성공 (ID 반환)
- [ ] 등록 후 목록에 포함 확인
- [ ] 잔액 조회에 반영 확인
- [ ] 테스트 토큰 삭제 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | ethereum-mainnet | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 잘못된 contract address | 주소 형식 오류 또는 잘못된 토큰 | ERC-20 contract address 확인 (Etherscan) |
| 지원하지 않는 네트워크 | 등록 네트워크 미지원 | 지원 네트워크 목록 확인 |
| default-deny 충돌 | ALLOWED_TOKENS 정책에 새 토큰 미포함 | 정책 설정에서 토큰 허용 |
| 삭제 실패 | 해당 토큰이 정책에서 참조됨 | 정책에서 토큰 참조 해제 후 삭제 |

## Cleanup
Step 6에서 테스트 토큰(DAI)을 삭제한다. 삭제 실패 시 수동으로 `DELETE /v1/admin/tokens/<TOKEN_ID>`를 실행한다.
