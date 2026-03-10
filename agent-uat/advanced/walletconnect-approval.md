---
id: "advanced-02"
title: "WalletConnect Owner 승인"
category: "advanced"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["walletconnect", "owner", "approval", "signing"]
---

# WalletConnect Owner 승인

## Metadata
- **ID**: advanced-02
- **Category**: advanced
- **Network**: ethereum-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 서명만 수행하며 트랜잭션을 실행하지 않음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Owner 등록 완료 (approval_method=walletconnect)
- [ ] WalletConnect 호환 지갑 앱 (MetaMask, Rainbow 등) 준비
- [ ] WalletConnect 세션이 이미 설정된 상태

## Scenario Steps

### Step 1: Owner 상태 확인
**Action**: 현재 Owner 상태를 조회한다.
```bash
curl -s http://localhost:3100/v1/owner/status \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, Owner 상태가 반환된다
**Check**: `state` 필드가 `LOCKED`인지 확인. `approval_method`가 `walletconnect`인지 확인

### Step 2: 승인 필요 정책 확인
**Action**: 현재 정책에서 owner_approval 조건이 설정되어 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/policies \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 정책 목록이 반환된다
**Check**: `owner_approval` 조건이 포함된 정책이 있는지 확인. 없으면 시나리오 SKIP 안내

### Step 3: 승인 대기 트랜잭션 Simulate
**Action**: owner_approval이 필요한 트랜잭션을 simulate으로 실행하여 승인 요구를 트리거한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, simulate 결과에 승인 필요 상태가 표시된다
**Check**: `requiresApproval: true` 또는 승인 관련 응답 필드 확인

### Step 4: WalletConnect 승인 요청 확인
**Action**: 사용자에게 WalletConnect 지갑 앱에서 승인 요청이 수신되었는지 확인을 요청한다.
- WalletConnect 연결된 지갑 앱(MetaMask 등)에 서명 요청이 나타나야 한다
- 요청 내용: 트랜잭션 승인 메시지 (EIP-712 또는 personal_sign)

**Expected**: 사용자가 지갑 앱에서 승인 요청을 확인
**Check**: 사용자에게 "지갑 앱에서 승인 요청이 보이시나요?" 확인

### Step 5: Owner 승인 서명
**Action**: 사용자가 WalletConnect 지갑 앱에서 승인 서명을 수행한다.
- 이 단계는 사용자가 수동으로 수행해야 한다
- 지갑 앱에서 "서명" 또는 "승인" 버튼을 탭한다

**Expected**: 서명이 완료되고 데몬에 전달된다
**Check**: 사용자에게 "서명을 완료하셨나요?" 확인

### Step 6: 승인 완료 후 상태 확인
**Action**: 승인 완료 후 트랜잭션 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `approved` 또는 `pending_execution`으로 전환된다
**Check**: `status` 필드가 승인 완료 상태인지 확인

## Verification
- [ ] Owner 상태 조회 성공 (state=LOCKED, approval_method=walletconnect)
- [ ] owner_approval 정책 존재 확인
- [ ] Simulate에서 승인 필요 응답 확인
- [ ] WalletConnect 지갑 앱에서 승인 요청 수신
- [ ] Owner 서명 완료
- [ ] 트랜잭션 상태 전환 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 서명만 (트랜잭션 미실행) | ethereum-mainnet | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 이 시나리오는 서명 플로우만 검증한다. 실제 트랜잭션 실행은 별도 시나리오에서 수행한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Owner 미등록 (state=NONE) | Owner 등록이 되지 않음 | `POST /v1/owner/register`로 Owner 등록 먼저 수행 |
| WalletConnect 세션 만료 | WC 세션 타임아웃 | WalletConnect 재연결 (pairing URI 재생성) |
| approval_method 불일치 | walletconnect가 아닌 다른 방법으로 등록 | Owner 재등록 시 approval_method=walletconnect 지정 |
| 서명 요청 미수신 | WC 릴레이 서버 연결 문제 | 네트워크 확인, WC 세션 재설정 |
| 서명 거부 | 사용자가 지갑 앱에서 거부 | 재시도 시 승인 선택 |
