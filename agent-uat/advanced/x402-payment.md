---
id: "advanced-03"
title: "x402 HTTP 결제"
category: "advanced"
auth: "session"
network: ["ethereum-mainnet", "base-mainnet"]
requires_funds: true
estimated_cost_usd: "1.00"
risk_level: "medium"
tags: ["x402", "payment", "http-payment"]
---

# x402 HTTP 결제

## Metadata
- **ID**: advanced-03
- **Category**: advanced
- **Network**: ethereum-mainnet, base-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$1.00
- **Risk Level**: medium -- 메인넷에서 실제 USDC 결제, 서비스 비용 발생

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] x402 지원 서비스 URL 준비 (없으면 simulate까지만 진행)
- [ ] USDC 보유 (Base 또는 Ethereum, 최소 $1.00)
- [ ] x402 결제 기능 활성화 (Admin Settings)

## Scenario Steps

### Step 1: x402 기능 지원 확인
**Action**: connect-info에서 x402 결제 기능 지원 여부를 확인한다.
```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, capabilities에 x402 관련 정보가 포함된다
**Check**: x402 capability가 활성화되어 있는지 확인

### Step 2: x402 서비스 요청 (402 응답 수신)
**Action**: x402 지원 서비스에 요청하여 402 Payment Required 응답을 수신한다.
```bash
curl -s -o /dev/null -w "%{http_code}" <X402_SERVICE_URL>
```
**Expected**: HTTP 402 Payment Required, 결제 조건이 응답 헤더 또는 body에 포함된다
**Check**: 결제 금액, 토큰 주소, 네트워크 정보 파싱. x402 서비스가 없는 경우 이 단계에서 SKIP하고 Step 4로 이동

### Step 3: 결제 조건 파싱
**Action**: 402 응답에서 결제 조건을 파싱한다.
- 결제 금액 (amount)
- 결제 토큰 (USDC contract address)
- 결제 네트워크 (Base 또는 Ethereum)
- 수령 주소 (payee address)

**Expected**: 결제 조건이 명확히 파싱된다
**Check**: 결제 금액이 예상 범위 내인지 확인. 과도한 금액이면 사용자에게 경고

### Step 4: Simulate으로 결제 트랜잭션 확인
**Action**: x402 결제 트랜잭션을 simulate으로 확인한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "X402_PAYMENT",
    "params": {
      "serviceUrl": "<X402_SERVICE_URL>",
      "amount": "<PAYMENT_AMOUNT>",
      "token": "USDC"
    },
    "network": "base-mainnet"
  }'
```
**Expected**: 200 OK, 예상 가스비와 결제 금액이 반환된다
**Check**: `estimatedFee`, `paymentAmount` 확인. 가스비가 $0.05를 초과하면 사용자에게 경고

### Step 5: 사용자 승인 후 결제 실행
**Action**: 사용자 승인을 받은 후 실제 결제 트랜잭션을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "X402_PAYMENT",
    "params": {
      "serviceUrl": "<X402_SERVICE_URL>",
      "amount": "<PAYMENT_AMOUNT>",
      "token": "USDC"
    },
    "network": "base-mainnet"
  }'
```
**Expected**: 200 OK, 결제 트랜잭션 ID가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 6: 결제 후 서비스 재요청
**Action**: 결제 완료 후 동일 서비스에 재요청하여 접근 가능 여부를 확인한다.
```bash
curl -s -o /dev/null -w "%{http_code}" <X402_SERVICE_URL> \
  -H 'X-Payment-Proof: <PAYMENT_PROOF>'
```
**Expected**: HTTP 200 OK, 서비스에 정상 접근 가능
**Check**: 응답 코드가 200인지 확인. 402가 계속되면 결제 증명 전달 실패

## Verification
- [ ] x402 capability 확인 (connect-info)
- [ ] 402 응답 수신 및 결제 조건 파싱 (서비스 있는 경우)
- [ ] Simulate 성공 (예상 비용 확인)
- [ ] 결제 트랜잭션 생성 성공 (서비스 있는 경우)
- [ ] 결제 후 서비스 접근 성공 (서비스 있는 경우)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| USDC approve (필요 시) | base-mainnet | ~50,000 | ~$0.01 |
| x402 payment transfer | base-mainnet | ~65,000 | ~$0.01 |
| Service payment amount | - | - | ~$1.00 |
| **Total** | | | **~$1.00** |

> **Note**: x402 서비스가 없는 경우 simulate까지만 진행하며 비용은 $0이다. Base 네트워크 사용 시 가스비가 매우 저렴하다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| x402 서비스 없음 | 테스트 가능한 x402 서비스가 없음 | simulate까지만 진행하고 SKIP 기록 |
| USDC 잔액 부족 | 결제 금액보다 USDC 잔액이 적음 | USDC 충전 후 재시도 |
| Approve 실패 | USDC approve 트랜잭션 실패 | APPROVED_SPENDERS 정책 확인 |
| 결제 후 여전히 402 | 결제 증명 전달 실패 | X-Payment-Proof 헤더 확인, 서비스 측 확인 |
| 네트워크 불일치 | 서비스가 요구하는 네트워크와 지갑 네트워크 불일치 | 결제 조건의 네트워크로 전환 |
