---
id: "advanced-06"
title: "가스 조건부 실행"
category: "advanced"
network: ["ethereum-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["gas", "conditional", "execution", "gas-price"]
---

# 가스 조건부 실행

## Metadata
- **ID**: advanced-06
- **Category**: advanced
- **Network**: ethereum-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- dry-run만 사용하며 실제 트랜잭션을 실행하지 않음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] EVM 지갑 보유 (Ethereum Mainnet)
- [ ] 가스 조건부 실행 기능 활성화

## Scenario Steps

### Step 1: 현재 가스 가격 조회
**Action**: Ethereum Mainnet의 현재 가스 가격을 조회한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 가스 추정 정보가 포함된다 (gasPrice 또는 maxFeePerGas)
**Check**: 현재 가스 가격을 기록 (이후 단계에서 비교 기준으로 사용)

### Step 2: 낮은 가스 상한 설정 (조건 미충족 테스트)
**Action**: 현재 가스의 50% 수준으로 maxGasPrice를 설정하여 조건 미충족 상태를 테스트한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-mainnet",
    "gasCondition": {
      "maxGasPrice": "<CURRENT_GAS_50_PERCENT>"
    }
  }'
```
**Expected**: 가스 조건 미충족 응답 (GAS_CONDITION_NOT_MET 또는 대기 상태)
**Check**: 응답에 가스 조건 미충족 사유가 포함되어 있는지 확인

### Step 3: 가스 조건 미충족 응답 분석
**Action**: 미충족 응답의 상세 정보를 확인한다.
- 현재 가스 가격 vs 설정한 상한 비교
- 예상 대기 시간 또는 가격 추이 정보 (제공되는 경우)

**Expected**: 가스 조건 미충족 이유가 명확히 설명된다
**Check**: `currentGasPrice > maxGasPrice` 관계 확인

### Step 4: 높은 가스 상한 설정 (조건 충족 테스트)
**Action**: 현재 가스의 200% 수준으로 maxGasPrice를 설정하여 조건 충족 상태를 테스트한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<OWN_ADDRESS>",
    "value": "0.001",
    "network": "ethereum-mainnet",
    "gasCondition": {
      "maxGasPrice": "<CURRENT_GAS_200_PERCENT>"
    }
  }'
```
**Expected**: 200 OK, 정상 dry-run 결과가 반환된다 (가스 조건 충족)
**Check**: 정상 실행 가능 상태로 응답되는지 확인. `estimatedFee` 포함

### Step 5: 가스 조건 충족 결과 확인
**Action**: 조건 충족 시 실행 가능한 트랜잭션 정보를 확인한다.
- 예상 가스비, 실행 가능 여부
- 가스 조건을 제거한 경우와 동일한 결과인지 비교

**Expected**: 가스 조건 충족 상태에서 정상 dry-run 결과와 동일
**Check**: `estimatedFee`가 정상 범위인지 확인

### Step 6: 결과 요약
**Action**: 가스 조건부 실행의 동작을 요약한다.
- 낮은 상한: 조건 미충족 (실행 대기 또는 거부)
- 높은 상한: 조건 충족 (정상 실행 가능)
- 가스 가격 변동에 따라 자동으로 실행 시점을 제어할 수 있음

**Expected**: 가스 조건부 실행의 정상 동작 확인
**Check**: 두 시나리오(미충족/충족)의 응답 차이가 명확

## Verification
- [ ] 현재 가스 가격 조회 성공
- [ ] 낮은 가스 상한에서 조건 미충족 응답 확인
- [ ] 미충족 사유가 명확히 표시됨
- [ ] 높은 가스 상한에서 조건 충족 응답 확인
- [ ] 조건 충족 시 정상 실행 가능 상태 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| Dry-run only (no execution) | ethereum-mainnet | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 이 시나리오는 dry-run만 사용하므로 실제 비용은 $0이다. 가스 조건부 동작의 로직만 검증한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 가스 조건부 기능 미지원 | gasCondition 파라미터 미인식 | Admin Settings에서 기능 활성화 확인 |
| 가스 추정 실패 | RPC 연결 오류 | RPC Pool 상태 확인, 엔드포인트 건강 상태 확인 |
| 조건 항상 충족 | 설정한 상한이 너무 높음 | 현재 가스 가격의 50% 이하로 상한 설정 |
| 조건 항상 미충족 | 네트워크 혼잡으로 가스 급등 | 현재 가스 가격의 200% 이상으로 상한 설정 |
| dry-run 타임아웃 | RPC 응답 지연 | 다른 RPC 엔드포인트로 전환 또는 재시도 |
