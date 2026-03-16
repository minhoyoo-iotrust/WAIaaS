---
id: "advanced-07"
title: "메시지 서명 및 검증"
category: "advanced"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["sign-message", "personal_sign", "eip-712", "typedData", "verify"]
---

# 메시지 서명 및 검증

## Metadata
- **ID**: advanced-07
- **Category**: advanced
- **Network**: ethereum-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 서명만 수행하며 트랜잭션을 실행하지 않음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] EVM 지갑 최소 1개 생성 완료
- [ ] 검증용 viem 또는 ethers.js 설치 (로컬 Node.js 환경)

## Scenario Steps

### Step 1: 지갑 주소 확인
**Action**: 서명에 사용할 EVM 지갑의 주소를 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 지갑 목록이 반환된다
**Check**: EVM 지갑의 `id`와 `address`를 기록. 이후 서명 검증 시 address와 비교

### Step 2: personal_sign — UTF-8 메시지 서명
**Action**: 일반 텍스트 메시지에 personal_sign 서명을 수행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/sign-message \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "message": "Hello, WAIaaS!"
  }'
```
**Expected**: 200 OK, `signature` 필드에 0x-프리픽스 서명값이 반환된다
**Check**: `id`, `signature`, `signType: "personal"` 필드 확인. signature 값 기록

### Step 3: personal_sign 서명 검증
**Action**: viem의 `verifyMessage`로 서명자 주소가 지갑 주소와 일치하는지 검증한다.
```javascript
// Node.js 검증 스크립트
import { verifyMessage } from 'viem';

const valid = await verifyMessage({
  address: '<WALLET_ADDRESS>',
  message: 'Hello, WAIaaS!',
  signature: '<SIGNATURE_FROM_STEP_2>',
});
console.log('personal_sign valid:', valid); // true
```
**Expected**: `verifyMessage`가 `true`를 반환한다
**Check**: 서명자 주소가 지갑 주소와 정확히 일치

### Step 4: EIP-712 typedData — Permit 구조 서명
**Action**: Uniswap Permit2 스타일 EIP-712 구조 데이터에 서명한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/sign-message \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "signType": "typedData",
    "typedData": {
      "domain": {
        "name": "Permit2",
        "version": "1",
        "chainId": 1,
        "verifyingContract": "0x000000000022D473030F116dDEE9F6B43aC78BA3"
      },
      "types": {
        "PermitSingle": [
          {"name": "details", "type": "PermitDetails"},
          {"name": "spender", "type": "address"},
          {"name": "sigDeadline", "type": "uint256"}
        ],
        "PermitDetails": [
          {"name": "token", "type": "address"},
          {"name": "amount", "type": "uint160"},
          {"name": "expiration", "type": "uint48"},
          {"name": "nonce", "type": "uint48"}
        ]
      },
      "primaryType": "PermitSingle",
      "message": {
        "details": {
          "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "amount": "1000000",
          "expiration": "1735689600",
          "nonce": "0"
        },
        "spender": "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        "sigDeadline": "1735689600"
      }
    }
  }'
```
**Expected**: 200 OK, `signature` 필드에 EIP-712 서명값이 반환된다
**Check**: `signType: "typedData"` 확인. signature 값 기록

### Step 5: EIP-712 typedData 서명 검증
**Action**: viem의 `verifyTypedData`로 서명 유효성을 검증한다.
```javascript
import { verifyTypedData } from 'viem';

const valid = await verifyTypedData({
  address: '<WALLET_ADDRESS>',
  domain: {
    name: 'Permit2',
    version: '1',
    chainId: 1,
    verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  types: {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  primaryType: 'PermitSingle',
  message: {
    details: {
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amount: '1000000',
      expiration: '1735689600',
      nonce: '0',
    },
    spender: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    sigDeadline: '1735689600',
  },
  signature: '<SIGNATURE_FROM_STEP_4>',
});
console.log('typedData valid:', valid); // true
```
**Expected**: `verifyTypedData`가 `true`를 반환한다
**Check**: 서명자 주소가 지갑 주소와 정확히 일치

### Step 6: Hex 메시지 서명 — 0x-프리픽스 데이터
**Action**: 0x-프리픽스 hex 데이터에 personal_sign 서명을 수행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/sign-message \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "message": "0x48656c6c6f2c20574149616153"
  }'
```
**Expected**: 200 OK, hex 데이터에 대한 서명값이 반환된다
**Check**: `signature` 필드에 유효한 65바이트 서명 (0x + 130자 hex)

### Step 7: Hex 메시지 서명 검증
**Action**: hex 메시지의 서명을 검증한다.
```javascript
import { verifyMessage } from 'viem';

// 0x 프리픽스 hex는 raw bytes로 해석됨
const valid = await verifyMessage({
  address: '<WALLET_ADDRESS>',
  message: { raw: '0x48656c6c6f2c20574149616153' },
  signature: '<SIGNATURE_FROM_STEP_6>',
});
console.log('hex message valid:', valid); // true
```
**Expected**: `verifyMessage`가 `true`를 반환한다
**Check**: hex 데이터 서명이 지갑 주소와 매칭

### Step 8: 트랜잭션 기록 확인
**Action**: 서명 기록이 트랜잭션 목록에 저장되었는지 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, type=SIGN, status=SIGNED인 기록이 3건 존재한다
**Check**: Step 2, 4, 6에서 수행한 서명이 모두 기록되었는지 `id` 대조

## Verification
- [ ] personal_sign UTF-8 메시지 서명 성공 (signature 반환)
- [ ] personal_sign 서명이 verifyMessage로 검증 통과
- [ ] EIP-712 typedData 서명 성공 (Permit2 구조)
- [ ] EIP-712 서명이 verifyTypedData로 검증 통과
- [ ] 0x-프리픽스 hex 메시지 서명 성공
- [ ] hex 메시지 서명이 verifyMessage(raw)로 검증 통과
- [ ] 서명 기록 3건이 트랜잭션 목록에 type=SIGN, status=SIGNED로 기록

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| 서명만 (트랜잭션 미실행) | ethereum-mainnet | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 메시지 서명은 온체인 트랜잭션을 발생시키지 않는다. 가스비 없이 서명값만 생성된다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 400 ACTION_VALIDATION_FAILED | signType=typedData인데 typedData 필드 누락 | typedData 객체를 올바르게 전달 |
| 400 ACTION_VALIDATION_FAILED (Solana) | Solana 지갑에 EIP-712 typedData 요청 | EVM 지갑으로 전환 |
| verifyMessage 실패 | 메시지 원문이 서명 시와 다름 | 정확히 동일한 메시지 문자열 사용 |
| verifyTypedData 실패 | domain/types/message 필드가 서명 시와 불일치 | 서명 요청과 검증 시 동일한 구조 사용 |
| 500 CHAIN_ERROR | 지갑 키 접근 실패 | 데몬 마스터 패스워드 확인 |
