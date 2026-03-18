# #388 — defi-12 DCent Swap UAT 시나리오 API 엔드포인트 오류

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v32.9
- **상태:** FIXED
- **수정일:** 2026-03-18

## 설명

defi-12 (DCent Swap Aggregator) UAT 시나리오가 `/v1/transactions/simulate` 및 `/v1/transactions/send` 엔드포인트를 사용하도록 작성되어 있으나, DCent Swap은 Action Provider 기반으로 `/v1/actions/dcent_swap/dex_swap` 엔드포인트를 사용해야 한다. 현재 시나리오대로 실행하면 `VALIDATION_FAILED: to is required` 오류가 발생한다.

## 근본 원인

Action Provider 기반 DeFi 프로토콜(DCent Swap)은 `/v1/transactions/*` 파이프라인을 직접 사용하지 않고, `/v1/actions/:provider/:action` 엔드포인트를 통해 ActionProviderRegistry가 ContractCallRequest를 생성한 뒤 파이프라인에 주입한다. UAT 시나리오 작성 시 이 차이가 반영되지 않았다.

## 수정 대상

`agent-uat/defi/dcent-swap.md` — Step 2, 4의 API 호출을 수정:

### Step 2 (Simulate)
```bash
# 변경 전
POST /v1/transactions/simulate
{"type":"CONTRACT_CALL","action":"dcent-swap","params":{...}}

# 변경 후
POST /v1/actions/dcent_swap/dex_swap?dryRun=true
{"walletId":"<WALLET_ID>","network":"ethereum-mainnet","params":{...}}
```

### Step 4 (실행)
```bash
# 변경 전
POST /v1/transactions/send
{"type":"CONTRACT_CALL","action":"dcent-swap","params":{...}}

# 변경 후
POST /v1/actions/dcent_swap/dex_swap
{"walletId":"<WALLET_ID>","network":"ethereum-mainnet","params":{...}}
```

### Scenario A Step A2 (견적 비교)
```bash
# 변경 전
POST /v1/actions/dcent_swap/query_quotes

# 변경 후
POST /v1/actions/dcent_swap/get_quotes
```

## 영향 범위

- defi-12 메인 시나리오 Step 2, 4
- defi-12a Step A2 (엔드포인트 이름 오류: `query_quotes` → `get_quotes`)
- defi-12b Step B1 (동일 패턴)
- defi-12c Step C1 (동일 패턴)

## 테스트 항목

- [ ] 수정된 시나리오 Step 2의 API 호출이 200 응답을 반환하는지 확인
- [ ] 수정된 시나리오 Step 4의 API 호출이 201 응답을 반환하는지 확인
- [ ] Scenario A/B/C의 API 호출도 올바른 엔드포인트를 사용하는지 확인
