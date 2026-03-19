# 395 — DeFi UAT 시나리오 6개 API 엔드포인트/파라미터 불일치로 전수 실행 불가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** —
- **발견일:** 2026-03-19

## 현상

DeFi 카테고리 UAT 시나리오 6개(defi-01, 06, 07, 08, 09, 10)가 구 API 형식을 사용하여 전수 실행 불가.

### 1. 엔드포인트 불일치

시나리오 파일이 `/v1/transactions/simulate` + `action` 필드를 사용하는데, 실제 API는 `/v1/actions/{provider}/{action}` 형식:

| 시나리오 | 시나리오 사용 | 실제 API |
|----------|-------------|----------|
| defi-01 | `POST /v1/transactions/simulate` + `action: "jupiter-swap"` | `POST /v1/actions/jupiter_swap/swap` |
| defi-06 | `POST /v1/transactions/simulate` + `action: "jito-stake"` | `POST /v1/actions/jito_staking/stake` |
| defi-07 | `POST /v1/transactions/simulate` + `action: "aave-supply"` | `POST /v1/actions/aave_v3/aave_supply` |
| defi-08 | `POST /v1/transactions/simulate` + `action: "kamino-supply"` | `POST /v1/actions/kamino/kamino_supply` |
| defi-09 | `POST /v1/transactions/simulate` + `action: "pendle-buy-pt"` | `POST /v1/actions/pendle_yield/buy_pt` |
| defi-10 | `POST /v1/transactions/simulate` + `action: "drift-deposit"` | `POST /v1/actions/drift_perp/drift_add_margin` |

### 2. 파라미터명 불일치

| 시나리오 | 시나리오 사용 | 실제 파라미터 |
|----------|-------------|---------------|
| defi-07 | `asset: "USDC"` (심볼) | `asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"` (주소) |
| defi-08 | `reserve: "USDC"` | `asset: "USDC"` |
| defi-10 | `market: "USDC"` | `asset: "USDC"` |
| defi-06 | `amount: "0.005"` (human) | `amount: "50000000"` (lamports, 최소 0.05 SOL) |

### 3. dryRun 쿼리 파라미터 누락

시나리오가 `/v1/transactions/simulate`를 사용하지만 실제 dryRun은 `?dryRun=true` 쿼리 파라미터 사용.

## 영향

- UAT 에이전트가 시나리오를 그대로 실행하면 6개 시나리오 모두 `VALIDATION_FAILED` (400)로 실패
- 에이전트가 수동으로 엔드포인트/파라미터를 보정해야 실행 가능
- defi-12 DCent Swap만 올바른 `/v1/actions/` 형식 사용 중

## 원인

DeFi 프로바이더가 Stage 6 액션 프레임워크로 마이그레이션되면서 엔드포인트가 변경되었으나, UAT 시나리오가 갱신되지 않음.

## 수정 방안

6개 시나리오 파일의 API 호출을 현재 API 형식으로 갱신:
- 엔드포인트: `/v1/actions/{provider}/{action}?dryRun=true`
- 파라미터: 각 프로바이더의 Zod 입력 스키마에 맞게 수정
- amount: smallest unit 기반으로 통일

## 수정 대상 파일

- `agent-uat/defi/jupiter-swap.md`
- `agent-uat/defi/jito-staking.md`
- `agent-uat/defi/aave-lending.md`
- `agent-uat/defi/kamino-lending.md`
- `agent-uat/defi/pendle-yield.md`
- `agent-uat/defi/drift-perp.md`

## 테스트 항목

1. **수동 검증**: 각 시나리오의 Step 2(simulate/dryRun) API 호출이 200 OK 반환
2. **자동 검증**: UAT 에이전트가 시나리오 파일 그대로 실행 시 `VALIDATION_FAILED` 없이 진행
