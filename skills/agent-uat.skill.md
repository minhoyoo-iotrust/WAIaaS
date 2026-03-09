---
name: "WAIaaS Agent UAT"
description: "Interactive Agent UAT: run scenarios from markdown files to verify WAIaaS features on testnet/mainnet"
category: "testing"
tags: [uat, testing, scenarios, mainnet, testnet, defi, admin, waiass]
version: "2.9.0-rc"
dispatch:
  kind: "prompt"
  triggerPatterns: ["/agent-uat"]
---

# WAIaaS Agent UAT

AI 에이전트가 마크다운 시나리오를 읽고 사용자와 인터랙티브하게 실행하여 WAIaaS 기능을 메인넷/테스트넷에서 검증하는 시스템이다.

> AI agents must NEVER request the master password. Use only your session token.

masterAuth가 필요한 시나리오(지갑 CRUD 등)는 사용자에게 마스터 패스워드 직접 입력을 안내한다. 에이전트가 마스터 패스워드를 요청하거나 저장해서는 안 된다.

## 서브커맨드

| Command | Action |
|---------|--------|
| `/agent-uat help` | 이 skill 파일의 사용법 표시 |
| `/agent-uat run` | 모든 시나리오 목록 표시 후 선택 실행 |
| `/agent-uat run testnet` | testnet 카테고리 시나리오만 실행 |
| `/agent-uat run mainnet` | mainnet 카테고리 시나리오만 실행 |
| `/agent-uat run defi` | defi 카테고리 시나리오만 실행 |
| `/agent-uat run admin` | admin 카테고리 시나리오만 실행 |
| `/agent-uat run advanced` | advanced 카테고리 시나리오만 실행 |
| `/agent-uat run transfer` | transfer 태그가 있는 시나리오만 실행 |
| `/agent-uat run --network {id}` | 특정 네트워크 시나리오만 실행 |
| `/agent-uat run {scenario-id}` | 특정 시나리오 ID로 실행 (예: `testnet-01`) |

### 네트워크 ID 목록

`--network` 옵션에 사용 가능한 네트워크 식별자:

| Network ID | 환경 | 유형 |
|------------|------|------|
| `ethereum-mainnet` | EVM | Mainnet |
| `ethereum-sepolia` | EVM | Testnet |
| `polygon-mainnet` | EVM | Mainnet |
| `arbitrum-mainnet` | EVM | Mainnet |
| `base-mainnet` | EVM | Mainnet |
| `solana-mainnet` | Solana | Mainnet |
| `solana-devnet` | Solana | Testnet |
| `hyperliquid-mainnet` | Hyperliquid | Mainnet |
| `hyperliquid-testnet` | Hyperliquid | Testnet |

## 실행 프로토콜

에이전트는 아래 7단계 프로토콜을 순서대로 따른다.

### Phase 1: 시나리오 로드

1. `agent-uat/_index.md` 파일을 읽는다
2. 서브커맨드에 따라 필터링한다:
   - `run testnet` → Categories > Testnet 섹션의 시나리오만
   - `run mainnet` → Categories > Mainnet 섹션의 시나리오만
   - `run defi` → Categories > DeFi 섹션의 시나리오만
   - `run admin` → Categories > Admin 섹션의 시나리오만
   - `run advanced` → Categories > Advanced 섹션의 시나리오만
   - `run transfer` → `tags` 필드에 `transfer`가 포함된 시나리오만
   - `run --network {id}` → Network Index에서 해당 네트워크의 시나리오만
   - `run {scenario-id}` → 해당 ID의 시나리오만
   - `run` (인자 없음) → 전체 목록 표시 후 사용자가 선택
3. 필터링된 시나리오 목록을 테이블로 사용자에게 표시한다:
   ```
   | # | ID | Title | Network | Cost | Risk |
   |---|-----|-------|---------|------|------|
   | 1 | testnet-01 | 지갑 CRUD 검증 | all | $0 | none |
   ```
4. 사용자에게 실행할 시나리오 확인을 받는다 (전체/선택/취소)

### Phase 2: 지갑 선택

1. `GET /v1/connect-info` API를 호출하여 현재 세션에 연결된 지갑 목록을 조회한다:
   ```bash
   curl -s http://localhost:3100/v1/connect-info \
     -H 'Authorization: Bearer <session-token>'
   ```
2. 시나리오 마크다운의 `network` 필드와 매칭되는 지갑을 자동 선택한다
3. 지갑 선택 규칙:
   - `environment: ethereum` 지갑 → `ethereum-*`, `polygon-*`, `arbitrum-*`, `base-*` 네트워크에 사용
   - `environment: solana` 지갑 → `solana-*` 네트워크에 사용
   - `hyperliquid-*` 네트워크 → EVM 지갑 사용 (Hyperliquid는 EVM 기반)
   - testnet 시나리오(`-sepolia`, `-devnet`, `-testnet` 접미사) → testnet 지갑 사용
   - mainnet 시나리오 → mainnet 지갑 사용
   - `network: [all]` → 지갑 선택 불필요 (masterAuth 기반 시나리오)
4. 같은 환경에 여러 지갑이 있으면 라벨과 함께 사용자에게 선택 요청:
   ```
   해당 네트워크에 사용 가능한 지갑이 여러 개 있습니다:
   1. wallet-abc (label: "main-eth", address: 0x...)
   2. wallet-def (label: "trading", address: 0x...)
   어떤 지갑을 사용할까요?
   ```
5. 매칭 지갑이 없으면 사용자에게 알리고 해당 시나리오를 SKIP 처리:
   ```
   [SKIP] testnet-02: ethereum-sepolia 네트워크에 사용 가능한 지갑이 없습니다.
   ```

### Phase 3: Dry-Run (자금 필요 시나리오)

`requires_funds: true`인 시나리오에서만 실행한다. `requires_funds: false`면 이 단계를 건너뛴다.

1. 시나리오의 각 트랜잭션 단계 전에 `POST /v1/transactions/dry-run` API를 호출한다:
   ```bash
   curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
     -H 'Authorization: Bearer <session-token>' \
     -H 'Content-Type: application/json' \
     -d '{
       "walletId": "<selected-wallet-id>",
       "type": "TRANSFER",
       "to": "<target-address>",
       "amount": "<amount>",
       "network": "<network-id>"
     }'
   ```
2. dry-run 결과를 사용자에게 표시한다:
   ```
   Dry-Run 결과:
   - 예상 가스비: 0.0021 ETH (~$5.50)
   - 성공 예상: Yes
   - 시나리오 예상 비용: ~$3.00

   실제 실행을 진행할까요? (Y/n)
   ```
3. dry-run 비용 경고 규칙:
   - dry-run이 실패(`success: false`)하면 사용자에게 알리고 계속 진행할지 확인
   - dry-run 예상 비용이 시나리오의 `estimated_cost_usd`보다 **2배 이상**이면 경고 표시:
     ```
     [경고] dry-run 예상 비용($11.00)이 시나리오 예상($3.00)의 2배를 초과합니다.
     네트워크 혼잡 또는 가스비 급등이 원인일 수 있습니다.
     계속 진행할까요? (Y/n)
     ```
   - 가스비가 0인 시나리오(Solana 기본 전송 등)는 dry-run 결과를 정보 차원에서만 표시
4. 사용자 승인 후 실제 실행을 진행한다

### Phase 4: 시나리오 실행

1. 시나리오 마크다운의 `## Scenario Steps` 섹션을 순서대로 실행한다
2. 각 Step에서:
   - `**Action**` 설명을 사용자에게 보여준다
   - `` ```bash `` 코드 블록의 API 호출을 실행한다
   - 응답을 `**Expected**` 및 `**Check**` 필드와 비교한다
   - 결과를 사용자에게 보고한다:
     ```
     Step 2: EVM 지갑 생성
     - Status: PASS
     - Response: 201 Created
     - Wallet ID: wallet-abc123
     - Address: 0x1234...5678
     ```
3. Step 실패 시:
   - `## Troubleshooting` 테이블에서 해당 증상을 검색한다
   - 매칭되는 해결책을 사용자에게 제시한다
   - 사용자에게 재시도/스킵/중단 선택을 받는다
4. 각 Step의 응답에서 다음 Step에 필요한 값(wallet ID, address 등)을 자동 추출하여 후속 Step에 대입한다

### Phase 5: Verification

1. `## Verification` 섹션의 체크리스트를 하나씩 확인한다
2. 각 항목의 통과/실패를 표시한다:
   ```
   Verification:
   - [PASS] EVM 지갑 생성 성공 (201 응답, id/address/environment 필드 존재)
   - [PASS] EVM 지갑 상세 조회 성공 (생성 정보와 일치)
   - [PASS] EVM 지갑 라벨 변경 성공 (새 라벨 반영)
   - [FAIL] Solana 지갑 생성 성공 → 실패 원인: 500 Internal Server Error
   ```

### Phase 6: Cleanup

1. `## Cleanup` 섹션이 있으면 해당 절차를 실행한다
2. 특히 CRUD 시나리오에서 생성한 리소스를 반드시 삭제한다
3. cleanup 실패 시 사용자에게 수동 정리 방법을 안내한다:
   ```
   [경고] Cleanup 실패: EVM 테스트 지갑 삭제 실패 (400: 세션에 연결됨)
   수동 정리가 필요합니다:
   1. 세션에서 해당 지갑 연결 해제
   2. DELETE /v1/wallets/<wallet-id> 실행
   ```

### Phase 7: 리포트 출력

시나리오 실행이 모두 완료되면 요약 리포트를 출력한다:

```
## Agent UAT Report

**Date**: 2026-03-09 14:30
**Category**: testnet
**Network**: all

### Results
| # | Scenario | Status | Gas Used | Notes |
|---|----------|--------|----------|-------|
| 1 | testnet-01: 지갑 CRUD 검증 | PASS | $0 | 10/10 steps passed |

### Summary
- **Total**: 1 scenarios
- **Passed**: 1
- **Failed**: 0
- **Skipped**: 0
- **Total Gas Cost**: ~$0.00

### Failed Scenarios
None
```

실패한 시나리오가 있는 경우 상세 정보를 추가한다:

```
### Failed Scenarios

**testnet-03: ERC-20 토큰 전송**
- **Failed Step**: Step 3 (토큰 전송 실행)
- **Error**: 403 Forbidden - Policy violation: TOKEN_TRANSFER not allowed
- **Troubleshooting**: 정책 설정에서 TOKEN_TRANSFER 타입 허용 필요
- **Reference**: Troubleshooting 테이블 Row 2
```

## 지갑 선택 규칙 요약

| 시나리오 Network | 지갑 Environment | 지갑 Network 조건 |
|-----------------|-----------------|-----------------|
| `ethereum-mainnet` | ethereum | mainnet |
| `ethereum-sepolia` | ethereum | testnet |
| `polygon-mainnet` | ethereum | mainnet |
| `arbitrum-mainnet` | ethereum | mainnet |
| `base-mainnet` | ethereum | mainnet |
| `solana-mainnet` | solana | mainnet |
| `solana-devnet` | solana | testnet |
| `hyperliquid-mainnet` | ethereum | mainnet |
| `hyperliquid-testnet` | ethereum | testnet |
| `all` | N/A | 지갑 선택 불필요 |

## Dry-Run 상세 규칙

| 조건 | 동작 |
|------|------|
| `requires_funds: false` | dry-run 건너뜀 |
| `requires_funds: true`, dry-run 성공 | 예상 비용 표시, 사용자 승인 후 실행 |
| `requires_funds: true`, dry-run 실패 | 실패 원인 표시, 계속 진행 여부 확인 |
| dry-run 비용 > `estimated_cost_usd` x 2 | 경고 표시, 계속 진행 여부 확인 |
| 가스비 0 시나리오 | 정보 차원 표시만, 자동 진행 |

## 에러 처리

| Error | 원인 | 대응 |
|-------|------|------|
| 401 Unauthorized | 세션 토큰 만료 | `POST /v1/sessions/renew`로 토큰 갱신 안내 |
| 403 Forbidden | 정책 위반 | 해당 정책 확인 안내 (`GET /v1/policies`) |
| 500 Internal Server Error | 데몬 내부 오류 | 데몬 로그 확인 안내 |
| Network Timeout | RPC 연결 실패 | RPC 상태 확인, 재시도 안내 |
| 404 Not Found | 잘못된 리소스 ID | 이전 Step 응답에서 올바른 ID 확인 |

## 파일 참조

| 파일 | 용도 |
|------|------|
| `agent-uat/_index.md` | 전체 시나리오 인덱스 (카테고리별/네트워크별) |
| `agent-uat/_template.md` | 시나리오 작성 표준 템플릿 |
| `agent-uat/README.md` | Agent UAT 시스템 개요 및 포맷 규격 |
| `agent-uat/testnet/` | Testnet 시나리오 디렉토리 |
| `agent-uat/mainnet/` | Mainnet 시나리오 디렉토리 |
| `agent-uat/defi/` | DeFi 시나리오 디렉토리 |
| `agent-uat/admin/` | Admin 시나리오 디렉토리 |
| `agent-uat/advanced/` | Advanced 시나리오 디렉토리 |
