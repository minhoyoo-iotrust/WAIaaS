---
id: "advanced-01"
title: "Smart Account UserOp Build/Sign"
category: "advanced"
auth: "master"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0.02"
risk_level: "low"
tags: ["smart-account", "userop", "erc-4337", "sepolia"]
---

# Smart Account UserOp Build/Sign

## Metadata
- **ID**: advanced-01
- **Category**: advanced
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.02
- **Risk Level**: low -- Sepolia 테스트넷에서 실행, 실제 자산 손실 없음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 마스터 비밀번호 인증 가능 (masterAuth)
- [ ] Smart Account 지갑 보유 (accountType=smart)
- [ ] Sepolia ETH 보유 (가스비용, 최소 0.01 ETH)
- [ ] AA Provider 설정 완료 (Lite 또는 Full 모드)

## Scenario Steps

### Step 1: Smart Account 지갑 목록 조회
**Action**: Smart Account 타입의 지갑 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 목록에서 `accountType: "smart"` 지갑이 존재한다
**Check**: `accountType` 필드가 `smart`인 지갑의 `id`와 `address`를 기록

### Step 2: connect-info에서 UserOp capability 확인
**Action**: connect-info API에서 UserOp 기능 지원 여부를 확인한다.
```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, `capabilities` 필드에 `userop` 관련 정보가 포함된다
**Check**: UserOp capability가 활성화되어 있는지, Lite/Full 모드 확인

### Step 3: UserOp Build
**Action**: ETH self-transfer UserOp를 빌드한다.
```bash
curl -s -X POST http://localhost:3100/v1/wallets/<SMART_WALLET_ID>/userop/build \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <master-token>' \
  -d '{
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, UserOp 빌드 결과가 반환된다 (buildId, userOp 데이터)
**Check**: `buildId`, `userOp` 필드 기록. `buildId`는 TTL 10분 내에 Sign에서 사용해야 한다

### Step 4: UserOp Sign
**Action**: 빌드된 UserOp에 서명한다.
```bash
curl -s -X POST http://localhost:3100/v1/wallets/<SMART_WALLET_ID>/userop/sign \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <master-token>' \
  -d '{
    "buildId": "<BUILD_ID>"
  }'
```
**Expected**: 200 OK, 서명된 UserOp와 userOpHash가 반환된다
**Check**: `userOpHash` 필드 기록

### Step 5: UserOp 빌드 상태 확인
**Action**: 빌드 상태를 조회한다 (TTL 10분 이내).
```bash
curl -s http://localhost:3100/v1/wallets/<SMART_WALLET_ID>/userop/builds/<BUILD_ID> \
  -H 'Authorization: Bearer <master-token>'
```
**Expected**: 200 OK, 빌드 상태가 `signed` 또는 `submitted`로 표시된다
**Check**: `status` 필드 확인

### Step 6: 트랜잭션 결과 확인
**Action**: 잔액을 재조회하여 트랜잭션 처리 여부를 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/balance?walletId=<SMART_WALLET_ID>&network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: ETH 잔액이 가스비만큼 감소 (self-transfer이므로 전송액은 동일)
**Check**: 가스비 차감분 확인

## Verification
- [ ] Smart Account 지갑 조회 성공 (accountType=smart)
- [ ] connect-info에서 UserOp capability 확인
- [ ] UserOp Build 성공 (buildId 반환)
- [ ] UserOp Sign 성공 (userOpHash 반환)
- [ ] Build 상태 조회 성공 (TTL 내)
- [ ] 트랜잭션 처리 후 잔액 변화 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| UserOp execution (ETH transfer) | ethereum-sepolia | ~21,000 + overhead | ~$0.02 |
| **Total** | | | **~$0.02** |

> **Note**: Sepolia 테스트넷이므로 실제 비용은 $0이다. 표시 금액은 메인넷 환산 기준이다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| AA Provider 미설정 오류 | aaProvider가 null (Lite 모드 미지원 작업) | Admin Settings에서 AA Provider 설정 (pimlico/alchemy/custom) |
| Build TTL 만료 | buildId 생성 후 10분 초과 | UserOp Build 재실행 |
| EntryPoint 버전 불일치 | Smart Account와 EntryPoint 버전 미스매치 | 지갑 생성 시 EntryPoint 버전 확인 |
| Insufficient funds | Sepolia ETH 부족 | Sepolia faucet에서 ETH 수급 |
| Lite/Full 모드 혼동 | Provider 설정에 따른 기능 차이 | connect-info에서 모드 확인 후 적절한 API 사용 |
